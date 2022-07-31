/**
 * UI NDVI Timeseries Visualization Dolomites
 * @author Moritz Rösch (moritz.roesch@stud-mail.uni-wuerzburg.de)
 * @date 31.07.2022
 */

/*******************************************************************************
 * Data *
 *
 * Import NDVI timeseries data reated in script "dolomiten_NDVItimeseries"
 * https://code.earthengine.google.com/c121d6194f168194af783abc5083e6b6
 * 
 * Import datasets mean NDVI (1984-2021), annual NDVI collection (summer months),
 * annual NDVI anomalies to mean NDVI.
 ******************************************************************************/

// Define a JSON object for storing the data model.
var d = {};

// Import AOI Dolomites
d.AOI = ee.FeatureCollection("users/moritzroesch/Dolomiten");

// Import annual NDVI collection from summer months (June-August)
var assetListNDVICol = ee.data.listAssets(
  "projects/dolomites-greening/assets/NDVICol")["assets"]
                    .map(function(d) { return d.name }); // list assets (images) in collection
d.NDVICol = ee.ImageCollection(assetListNDVICol); // create image collection from image assets

// Import annual NDVI anomaly collection from summer months (June-August)
var assetListNDVICol_ano = ee.data.listAssets(
  "projects/dolomites-greening/assets/NDVICol_ano")["assets"]
                    .map(function(d) { return d.name }); // list assets (images) in collection
d.NDVICol_ano = ee.ImageCollection(assetListNDVICol_ano); // create image collection from image assets

// Import mean NDVI (1984-2021)
d.NDVImean = ee.Image("projects/dolomites-greening/assets/NDVImean");

// Import SRTM DEM (30m)
d.DEM = ee.Image("USGS/SRTMGL1_003").clip(d.AOI);

// Dict of selectable years
d.years = {
  "1984": 1984, "1985": 1985, "1986": 1986, "1987": 1987, "1988": 1988,
  "1989": 1989, "1990": 1990, "1991": 1991, "1992": 1992, "1993": 1993,
  "1994": 1994, "1995": 1995, "1996": 1996, "1997": 1997, "1998": 1998,
  "1999": 1999, "2000": 2000, "2001": 2001, "2002": 2002, "2003": 2003,
  "2004": 2004, "2005": 2005, "2006": 2006, "2007": 2007, "2008": 2008,
  "2009": 2009, "2010": 2010, "2011": 2011, "2012": 2012, "2013": 2013,
  "2014": 2014, "2015": 2015, "2016": 2016, "2017": 2017, "2018": 2018,
  "2019": 2019, "2020": 2020, "2021": 2021
};

// Dict of selelctable layers
d.vis = {"NDVI": "NDVI", "NDVI anomalies": "NDVI anomalies"};


/*******************************************************************************
 * Components *
 *
 * Define the widgets that will compose the app.
 ******************************************************************************/

// Define a JSON object for storing UI components.
var c = {};

c.controlPanel = ui.Panel(); // build empty control panel for widgets
c.map = ui.Map(); // build empty map

// Info and description widgets
c.info = {}; // define container for all information widgets
c.info.titleLabel = ui.Label("Alpine greening in the Dolomites, Italy");
c.info.descriptionLabel = ui.Label(
  "This app visualizes the alpine greening in the Dolomites region in South Tyrol, Italy." +
  " A NDVI timeseries from 1984 to 2021 based on harmonized Landsat 5, Landsat 7 and Landsat 8 imagery" +
  " is generated to display the greening trend in the region. Landsat imagery was harmonized and cloud masked." +
  " This app can visualize the NDVI for each of the years as well as the NDVI anomalies of a year to" +
  " the NDVI mean (1984-2021). Furthermore, a mask based on SRTM 30m DEM can be generated" +
  " to only display the NDVI trend at a certain altitudinal level.");
c.info.panel = ui.Panel([ // add info text inside a panel for display in the app
  c.info.titleLabel, c.info.descriptionLabel]);

// Map visualization widgets
c.vis = {};
c.vis.label = ui.Label("Select visualization");
c.vis.descriptionLabel = ui.Label("Select the NDVI or the NDVI anomalies to the mean of 1984 - 2021");
c.vis.selector = ui.Select(
  Object.keys(d.vis),
  "Select a visualization",  Object.keys(d.vis)[0] // default to NDVI layer
  );
c.vis.panel = ui.Panel([c.vis.label, c.vis.descriptionLabel, c.vis.selector]);

// Date widgets
c.dates = {};
c.dates.label = ui.Label("Select year");
c.dates.descriptionLabel = ui.Label("Select the year that should be displayed on map");
c.dates.selector = ui.Select(
  Object.keys(d.years),
  "Select a year", Object.keys(d.years)[0]// TODO change value to newest data
  );
c.dates.panel = ui.Panel([c.dates.label, c.dates.descriptionLabel, c.dates.selector]);

// Elevation mask widgets
c.dem = {};
c.dem.label = ui.Label("Select elevation");
c.dem.descriptionLabel = ui.Label("Select a min. and max. elevation level to mask the selected layer " +
  "to the min. and max. elevation. The output layer includes all pixels at elevations >= min. " +
  "and <= max. elevation. Min. elevation has to be >=0 and max. elevation has to > min. elevation. " + 
  "Spatial resolution of Landsat and SRTM DEM is 30m.");
c.dem.labelmin = ui.Label("Min. elevation:");
c.dem.elemin = ui.Textbox({
  placeholder: "i.e. 1800"
});
c.dem.labelmax = ui.Label("Max. elevation:");
c.dem.elemax = ui.Textbox({
  placeholder: "i.e. 2000"
});
c.dem.panel = ui.Panel([c.dem.label, c.dem.descriptionLabel, c.dem.labelmin,
                        c.dem.elemin, c.dem.labelmax, c.dem.elemax]);

// Timeseries plot widgets
c.plot = {}; 
c.plot.label = ui.Label("NDVI time series plot");
c.plot.descriptionLabel = ui.Label("NDVI values of Dolomites region (or elevation masked region)" + 
  " with linear trendline.");
c.plot.chartPanel = ui.Panel(); // empty panel to plot the chart
c.plot.panel = ui.Panel([c.plot.label, c.plot.descriptionLabel, c.plot.chartPanel]);

// Define a legend widget group.
c.legend = {};
c.legend.title = ui.Label();
c.legend.colorbar = ui.Thumbnail(ee.Image.pixelLonLat().select(0));
c.legend.leftLabel = ui.Label('[min]');
c.legend.centerLabel = ui.Label();
c.legend.rightLabel = ui.Label('[max]');
c.legend.labelPanel = ui.Panel({
  widgets: [
    c.legend.leftLabel,
    c.legend.centerLabel,
    c.legend.rightLabel,
  ],
  layout: ui.Panel.Layout.flow('horizontal')
});
c.legend.panel = ui.Panel([
  c.legend.title,
  c.legend.colorbar,
  c.legend.labelPanel
]);

// Dividers for control panel
c.dividers = {};
c.dividers.divider1 = ui.Panel(); // empty panel as divider (is styled in styling section)
c.dividers.divider2 = ui.Panel();
c.dividers.divider3 = ui.Panel();
c.dividers.divider4 = ui.Panel();

/*******************************************************************************
 * Composition *
 *
 * Composing app with widgets and map.
 ******************************************************************************/

ui.root.clear(); // clear the root including default map
ui.root.add(c.controlPanel);
ui.root.add(c.map);

c.controlPanel.add(c.info.panel); // adding the information panel to the control panel
c.controlPanel.add(c.dividers.divider1); // adding divider
c.controlPanel.add(c.vis.panel); // adding visualization panel to control panel
c.controlPanel.add(c.dividers.divider2); // adding divider
c.controlPanel.add(c.dates.panel); // adding the year selection panel
c.controlPanel.add(c.dividers.divider3); // adding divider
c.controlPanel.add(c.dem.panel); // adding elevation selection to control panel
c.controlPanel.add(c.dividers.divider4); // adding divider
c.controlPanel.add(c.plot.panel); // add timeseries plot panel to panel
c.map.add(c.legend.panel) // add legend panel

/*******************************************************************************
 * Styling *
 *
 * Define and set widget style properties.
 ******************************************************************************/

// Define a JSON object for defining CSS-like class style properties.
var s = {};

// Define style classes for widgets of the same class
s.descrText = { // style for any descriptive text
  fontSize: "13px",
  color: "505050"
};

s.widgetTitle = { // style for every widget title
  fontSize: '15px',
  fontWeight: 'bold',
  margin: '8px 8px 0px 8px',
  color: '383838'
};

s.stretchHorizontal = { // style that horizontally stretches elements
  stretch: 'horizontal'
};

s.divider = { // style for divider panels
  backgroundColor: 'F0F0F0',
  height: '4px',
  margin: '20px 0px'
};

s.opacityWhiteMed = {
  backgroundColor: 'rgba(255, 255, 255, 0.5)'
};

s.opacityWhiteNone = {
  backgroundColor: 'rgba(255, 255, 255, 0)'
};

// Set style
c.controlPanel.style().set({ // inline styling for control panel width
  width: "500px"
});

c.info.titleLabel.style().set({ // inline styling for title
  fontSize: "20px",
  fontWeight: "bold"
});

c.info.descriptionLabel.style().set(s.descrText);

c.vis.label.style().set(s.widgetTitle);
c.vis.descriptionLabel.style().set(s.descrText);

c.dates.label.style().set(s.widgetTitle);
c.dates.descriptionLabel.style().set(s.descrText);

c.dem.label.style().set(s.widgetTitle);
c.dem.descriptionLabel.style().set(s.descrText);
c.dem.labelmin.style().set(s.descrText);
c.dem.labelmax.style().set(s.descrText);

c.plot.label.style().set(s.widgetTitle);
c.plot.descriptionLabel.style().set(s.descrText);

c.legend.title.style().set({
  fontWeight: 'bold',
  fontSize: '12px',
  color: '383838'
});
c.legend.title.style().set(s.opacityWhiteNone);
c.legend.colorbar.style().set({
  stretch: 'horizontal',
  margin: '0px 8px',
  maxHeight: '20px'
});
c.legend.leftLabel.style().set({
  margin: '4px 8px',
  fontSize: '12px'
});
c.legend.leftLabel.style().set(s.opacityWhiteNone);
c.legend.centerLabel.style().set({
  margin: '4px 8px',
  fontSize: '12px',
  textAlign: 'center',
  stretch: 'horizontal'
});
c.legend.centerLabel.style().set(s.opacityWhiteNone);
c.legend.rightLabel.style().set({
  margin: '4px 8px',
  fontSize: '12px'
});
c.legend.rightLabel.style().set(s.opacityWhiteNone);
c.legend.panel.style().set({
  position: 'bottom-left',
  width: '200px',
  padding: '0px'});
c.legend.panel.style().set(s.opacityWhiteMed);
c.legend.labelPanel.style().set(s.opacityWhiteNone);

// Loop through setting divider style.
Object.keys(c.dividers).forEach(function(key) {
  c.dividers[key].style().set(s.divider);
});

/*******************************************************************************
 * Behaviors *
 *
 *Define app behavior on UI activity.
 ******************************************************************************/

// Function that updates the map and displays the currently selected image
function update_map(){
  // Fetch current value of components
  var year = c.dates.selector.getValue();
  var yearInt = parseInt(year);
  var vis_var = c.vis.selector.getValue();
  var eleMin = c.dem.elemin.getValue();
  var eleMax = c.dem.elemax.getValue();
  
  // Select and filter image collection based on input
  if (vis_var == "NDVI") { 
    var col = d.NDVICol.filter(ee.Filter.calendarRange(yearInt, yearInt, "year"));
  } else {
    var col = d.NDVICol_ano.filter(ee.Filter.calendarRange(yearInt, yearInt, "year"));
  }

  // Get image of filtered collection
  var img = ee.ImageCollection(col).first();
  
  // Select masking options based on input
  if ((typeof eleMin != "undefined" & typeof eleMax != "undefined") & // if both textbooxes are filled
      parseInt(eleMax) > parseInt(eleMin) & // AND elemax > then elemin
      parseInt(eleMin) >= 0) { // AND elemin >= 0
        // Build DEM mask with input values
        var DEMmask = d.DEM.gte(parseInt(eleMin))
          .and(d.DEM.lte(parseInt(eleMax))).selfMask();
        // Apply mask to img
        var img = img.updateMask(DEMmask);
      }

  // Create visualization parameters based on vis input
  if (vis_var == "NDVI") { 
    var visPara = {min: 0, max: 1, palette: ["red", "orange", "green"]}; // Params for NDVI
  } else {
    var visPara =  {min: -0.5, max: 0.5, palette: ["red", "white", "blue"]}; // Params for anomalies
  }
  
  // Create map layer
  var layer = ui.Map.Layer({
    eeObject: img,
    visParams: visPara,
    name: vis_var + " " + year
  });
  c.map.layers().set(0, layer); //set the first layer of map component to the generated image layer
}

// Create callback that change map display based on users input
c.vis.selector.onChange(update_map);
c.dates.selector.onChange(update_map);
c.dem.elemin.onChange(update_map);
c.dem.elemax.onChange(update_map);

// Function that generates timeseries plot based on masked/unmasked layer
function update_plot(){
  // Fetch current value of components
  var eleMin = c.dem.elemin.getValue();
  var eleMax = c.dem.elemax.getValue();
  
  // Select masking options based on input
  if ((typeof eleMin != "undefined" & typeof eleMax != "undefined") & // if both textbooxes are filled
      parseInt(eleMax) > parseInt(eleMin) & // AND elemax > then elemin
      parseInt(eleMin) >= 0) { // AND elemin >= 0
        // Build function that applies DEM mask to collection
        var DEMmask_func = function(img){
          var DEMmask = d.DEM.gte(parseInt(eleMin))
            .and(d.DEM.lte(parseInt(eleMax))).selfMask();
          return img.updateMask(DEMmask);
        }
        // Apply mask to image collection
        var col = d.NDVICol.map(DEMmask_func);
        // Create addOn for title if mask is selected
        var title_addOn = " at elevation " + c.dem.elemin.getValue() + "m to " + c.dem.elemax.getValue() + "m";
      } else {
        var col = d.NDVICol;
        var title_addOn = "";
      }
   
  // Create timeseries plot for masked/unmasked NDVI layer
  var plot = ui.Chart.image.series({imageCollection: col, 
                                    region: d.AOI, 
                                    reducer: ee.Reducer.mean(),
                                    scale: 30
  })
  .setChartType("ScatterChart")
  .setOptions({
    title: "Annual NDVI during the summer months (June - September)" + title_addOn,
    vAxis: {title: 'NDVI'},
    hAxis: {title: 'Date'},
    pointSize: 2,
    trendlines: {0: {color: 'red'}}
  });
  c.plot.chartPanel.widgets().set(0, plot);
}

// Create callback to change plot when elevation mask is changed
c.dem.elemin.onChange(update_plot);
c.dem.elemax.onChange(update_plot);

// Function that updates and fills legend
// Handles drawing the legend when band selector changes.
function update_legend() {
  c.legend.title.setValue(c.vis.selector.getValue());
  
  if (c.vis.selector.getValue() == "NDVI") { 
     c.legend.colorbar.setParams({min: 0, max: 1, bbox: [0, 0, 1, 100],
      dimensions: "100x10", format: "png", palette: ["red", "orange", "green"]}); // set vis params for NDVI layer
     c.legend.leftLabel.setValue(0.0);
     c.legend.centerLabel.setValue(0.5);
     c.legend.rightLabel.setValue(1.0);
  } else {
     c.legend.colorbar.setParams({min: -0.5, max: 0.5, bbox: [-0.5, 0, 0.5, 100],
      dimensions: "100x10", format: "png", palette: ["red", "white", "blue"]}); // set vis params for anomalies layer
     c.legend.leftLabel.setValue(-0.5);
     c.legend.centerLabel.setValue(0.0);
     c.legend.rightLabel.setValue(0.5);
  }
}

// Create callback that change map display based on users input
c.vis.selector.onChange(update_legend);


/*******************************************************************************
 * Initialize *
 *
 * Initialize the app state on load.
 ******************************************************************************/

// Set model state based on default values.
c.map.setCenter({
  lon: 11.9,
  lat: 46.3,
  zoom: 8
});

// Render the map and legend.
update_map();
update_legend();
// Render timeseries plot
update_plot();