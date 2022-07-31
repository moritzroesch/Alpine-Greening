/*************
* Import AOI *
*************/
var AOI = ee.FeatureCollection("users/moritzroesch/Dolomiten");
Map.addLayer(AOI, {color: "red"}, "Dolomiten");
Map.centerObject(AOI, 8);


/**************************************************************
* Functions to filter, mask and harmonize Landsat Collections *
**************************************************************/
// Select and rename bands of Landsat 5 (TM) & 7 (ETM+)
function renameBandsTM_ETM(img) {
    var bands = ["B1", "B2", "B3", "B4"];
    var new_bands = ["Blue", "Green", "Red", "NIR"];
    return img.select(bands).rename(new_bands);
}

// Select and rename bands of Landsat 8 (OLI)
function renameBandsOLI(img) {
    var bands = ["B2", "B3", "B4", "B5"];
    var new_bands = ["Blue", "Green", "Red", "NIR"];
    return img.select(bands).rename(new_bands);
}

// Create and apply cloud mask based on the pixel_qa band
var cloudMask = function(img) {
  // Get the pixel_qa band
  var qa = img.select("pixel_qa");
  // Bit values for clouds, cloud shadows and snow
  var CloudShadowBitValue = 8;
  var CloudBitValue = 32;
  var SnowBitValue = 16;
  // Create masks
  var shadow_mask = qa.bitwiseAnd(CloudShadowBitValue).eq(0);
  var cloud_mask = qa.bitwiseAnd(CloudBitValue).eq(0);
  var snow_mask = qa.bitwiseAnd(SnowBitValue).eq(0);
  // Combine masks
  var final_mask = shadow_mask.and(cloud_mask).and(snow_mask);
  return img.updateMask(final_mask);
};

// Construct date filter 
var dateFilter = ee.Filter.and(
  ee.Filter.calendarRange(6, 8, "month"), // select summer months (June-August)
  ee.Filter.calendarRange(1984, 2021, "year")); // select all years excluding 2022

// Harmonization coefficients after Roy et al. 2016 (https://doi.org/10.1016/j.rse.2015.12.024)
var coefficients = {
  itcps: ee.Image.constant([0.0003, 0.0088, 0.0061, 0.0412])
             .multiply(10000),
  slopes: ee.Image.constant([0.8474, 0.8483, 0.9047, 0.8462])
};

// Linear transformation from ETM/TM to OLI
function etmToOli(img) {
  return img.select(["Blue", "Green", "Red", "NIR"])
      .multiply(coefficients.slopes)
      .add(coefficients.itcps)
      .round()
      .toShort()
      .copyProperties(img, img.propertyNames());  // take all properties from imag
}


/*****************************
* Import Landsat collections *
*****************************/
// Import Landsat 5 collection
var L5Col = ee.ImageCollection("LANDSAT/LT05/C01/T1_SR")
  .filterBounds(AOI) // filter to AOI
  .map(cloudMask) // apply cloud mask
  .map(renameBandsTM_ETM) // apply band selection and renaming
  .filter(dateFilter)
  .map(function(img){ // clip each image to AOI
    return img.clip(AOI);
  });

// Import Landsat 7 collection
var L7Col = ee.ImageCollection("LANDSAT/LE07/C01/T1_SR")
  .filterBounds(AOI) // filter to AOI
  .map(cloudMask) // apply cloud mask
  .map(renameBandsTM_ETM) // apply band selection and renaming
  .filter(dateFilter)
  .map(function(img){ // clip each image to AOI
    return img.clip(AOI);
  });
  
// Import Landsat 8 collection
var L8Col = ee.ImageCollection("LANDSAT/LC08/C01/T1_SR")
  .filterBounds(AOI) // filter to AOI
  .map(cloudMask) // apply cloud mask
  .map(renameBandsOLI) // apply band selection and renaming for OLI
  .filter(dateFilter) 
  .map(function(img){ // clip each image to AOI
    return img.clip(AOI);
  });
  
  
/****************************
* Reflectance harmonization *
****************************/
//Linear transformation to OLI
var L5Col = L5Col.map(etmToOli);
var L7Col = L7Col.map(etmToOli);


/********************
* Merge collections *
********************/
var LCol = L5Col.merge(L7Col).merge(L8Col);
var LCol = LCol.sort("system:time_start"); // sort date time
print("Merged collection", LCol);


/***************
* Compute NDVI *
***************/
// Create NDVI function
function NDVI(img) {
  var ndvi = img.expression(
    "(NIR - RED)/(NIR + RED)",
    {
    NIR: img.select("NIR"),
    RED: img.select("Red"),
    });
  return img
    .addBands(ndvi.rename("NDVI"))
    .float();
}

// Add NDVI to Image collection
var LCol = LCol.map(NDVI);

// Mask NDVI values below 0 to exclude water and snow areas that are not masked during bitmask
var maskNDVI = function(img){
  var mask = img.gt(0).selfMask();
  return img.updateMask(mask);
};
var LCol = LCol.map(maskNDVI);


/*******************************
* Create annual median mosaics *
*******************************/
var start_year = ee.Number.parse( // Define first year based on ImageCollection
  ee.Date(LCol.first().get("system:time_start")).format("YYYY"));
var years = ee.List.sequence(start_year, 2021); // list of years to map over

// Function that creates annual median mosaic
var annualMosaic = function(y){
  // Filter by year
    var LColYear = LCol
    .filter(ee.Filter.calendarRange(y, y, "year"));
    // Check number of images within one year
    var yearSize = LColYear.size();
    // Get the middle image of the collection for the system:time_start info
    var yearSizeDiv = yearSize.divide(2).round();
    var LColYearList = LColYear.toList(LColYear.size());
    var imgMid = LColYearList.get(yearSizeDiv);
    // Compute median of year and add metadata (e.g. number of images, datetime from middle image)
    // data and the unix time of the middle image within the year
    return LColYear
            .median()
            .set("Year", y)
            .set("No_of_images", yearSize)
            .copyProperties(ee.Image(imgMid), ["system:time_start"]);
};

// Apply median mosaic function to image collection
var LColMed = ee.ImageCollection.fromImages(
  years.map(annualMosaic)
);

var LColMedList = LColMed.toList(LColMed.size());
Map.addLayer(ee.Image(LColMedList.get(0)), {bands: ["Red", "Green", "Blue"], min: 0,
  max: 1500}, "RGB 1984");
print("Annual median collection", LColMed);


/*************************************************
* NDVI selection, mean and anomalies calculation *
*************************************************/
// Create NDVI collection and calculate mean NDVI
var NDVICol = LColMed.select("NDVI");
var NDVImean = NDVICol.mean();
print("NDVI mean", NDVImean);
Map.addLayer(NDVImean,
  {min: 0, max: 1, palette: ["red", "orange", "green"]},
  "NDVI mean");

var NDVIColList = NDVICol.toList(NDVICol.size());
print("NDVI annual median collection", NDVICol);
Map.addLayer(ee.Image(NDVIColList.get(0)),
  {min: 0, max: 1, palette: ["red", "orange", "green"]},
  "NDVI 1984");

// Function to compute anomalies from mean
var anomaly = function(y){
  var NDVIColYear = NDVICol
  .filter(ee.Filter.calendarRange(y, y, "year"))
  .first();
  var NDVIdif = NDVImean.subtract(NDVIColYear)
    .copyProperties(NDVIColYear, NDVIColYear.propertyNames());
  return NDVIdif;
};

// Apply anomaly function to NDVI collection
var NDVIColanomalies = ee.ImageCollection.fromImages(
  years.map(anomaly));
print("NDVI anomalies collection", NDVIColanomalies);
var NDVIColanomaliesList = NDVIColanomalies.toList(NDVICol.size());
Map.addLayer(ee.Image(NDVIColanomaliesList.get(0)),
  {min: -0.2, max: 0.2, palette: ["red", "white", "blue"]},
  "NDVI 1984 anomalies to mean (1984-2021)");


/*******************
* Export to assets *
*******************/
/*
* Run only if export is needed. For visualization in app all layers have been exported
* to cloud assets.


// Batch export of annual NDVI images to cloud assets
var batch = require("users/fitoprincipe/geetools:batch");
batch.Download.ImageCollection.toAsset(
  NDVICol, "NDVICol", {
    name: "NDVICol",
    scale: 30,
    region: AOI});
    
// Batch export of annual NDVI anomalies to cloud assets
batch.Download.ImageCollection.toAsset(
  NDVIColanomalies, "NDVIColanomalies", {
    name: "NDVIColanomalies",
    scale: 30,
    region: AOI});

 
// Export mean NDVI image to cloud assets
Export.image.toAsset({
  image: NDVImean,
  description: 'NDVImean',
  assetId: "NDVImean",
  region: AOI,
  scale: 30
});
 */

print("Script executed");