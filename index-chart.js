// add region (polygon) and sample (point)
var region = ee.Geometry.Polygon([
  [103.79747674876988,12.760742803224648],
  [104.37975213939488,12.760742803224648],
  [104.37975213939488,13.253145809333176],
  [103.79747674876988,13.253145809333176],
  [103.79747674876988,12.760742803224648]
  ])
var sample = ee.Geometry.Point([104.1064687734023,12.922597032067433])

// call the dataset as the Image Collection in 1 month to 1 year
var S2 = ee.ImageCollection("COPERNICUS/S2_SR")
  .filterBounds (region)
  .filterDate ('2022-01-01', '2023-01-01') //filter date, pur 1 month from January to February
;
print ('Image Collection of S2', S2);

// centering the map visualization to the center of the Region of Interest
Map.centerObject(region, 8); 

// clip Image Collection to Region of Interest
function clp(img) {
  return img.clip(region)
  }
var S2_clip = S2.map(clp)

//-------------------calculate index-------------------------------

// add plastic index from Cyprus University of Technology (Source: Themistocleous, et al., 2020)
// visualization of Index can be applied only for IMAGE
var image = S2_clip.median(); //change the ImageCollection to Image to visualize NDVI

var NDVI = image.expression( //using clipped S2 (S2_clip) Image Collection to image as the median
  '(N - R)/(N + R)', {
      'N': image.select('B8'),
      'R': image.select('B4')
  });

var PI = image.expression( //using clipped S2 (S2_clip) Image Collection to image as the median
    'N /(N + R)',  {
      'N': image.select('B8'),
      'R': image.select('B4')
});

Map.addLayer(NDVI, {min:0, max:1, palette: ['white', 'green']}, 'NDVI', 1);
Map.addLayer(PI, {min:0, max:1, palette: ['white', 'blue']}, 'PI', 1);


//------------------chart generation---------------------------------

// chart for Image Collection

// compute Index from Image Collection (S2_clip)
// computing NDVI
function addNDVI(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']);
  return image.addBands(ndvi.rename('ndvi'));
  }
  var S2_clip = S2_clip.map(addNDVI);

// computing NDWI
function addNDWI(image) {
  var ndwi = image.normalizedDifference(['B8', 'B3']);
  return image.addBands(ndwi.rename('ndwi'));
  }
  var S2_clip = S2_clip.map(addNDWI);

// compute PI
function addPI(image) {
  var N = image.select('B8');
  var R = image.select('B4');
  var pi_div = N.add(R);
  var pi = N.divide(pi_div);
  return image.addBands(pi.rename('pi'));
}
var S2_clip = S2_clip.map(addPI);

var S2_clip = S2_clip.select('ndvi', 'ndwi', 'pi'); //select the particular band only

// generating chart of Image Collection by day of year series
var chart = ui.Chart.image
  .doySeries ({
  imageCollection: S2_clip,
  region: sample,
  regionReducer: ee.Reducer.mean(),
  scale: 15,
  yearReducer: ee.Reducer.mean(),
  startDay: 1,
  endDay: 366, 
  })
  .setSeriesNames(['NDVI', 'NDWI', 'PI'])
  .setOptions({
    title: 'Plastic Index to Vegetation and Water',
    hAxis: {
      title: 'Day',
      titleTextStyle: {italic: true, bold: true}
    },
    vAxis: {
      title: 'Index',
      titleTextStyle: {italic: false, bold: true}
    },
    lineWidth: 3,
    colors: ['0f8755', '1d6b99', 'f0af07']
  });

print ('Index Chart per from Samples (5pts)', chart);
