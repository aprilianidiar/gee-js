/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var S1 = ee.ImageCollection("COPERNICUS/S1_GRD"),
    geometry = 
    /* color: #d63000 */
    /* displayProperties: [
      {
        "type": "marker"
      },
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry({
      "type": "GeometryCollection",
      "geometries": [
        {
          "type": "Point",
          "coordinates": [
            100.51066111112259,
            13.52068917593082
          ]
        },
        {
          "type": "Polygon",
          "coordinates": [
            [
              [
                99.51368334973476,
                14.769260425509373
              ],
              [
                99.51368334973476,
                13.38396331426771
              ],
              [
                101.31544116223476,
                13.38396331426771
              ],
              [
                101.31544116223476,
                14.769260425509373
              ]
            ]
          ],
          "geodesic": false,
          "evenOdd": true
        }
      ],
      "coordinates": []
    }),
    geomLabel = /* color: #98ff00 */ee.Geometry.Point([100.42015546347724, 13.543603125952695]);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var col = ee.ImageCollection('COPERNICUS/S1_GRD')
                    .filter(ee.Filter.eq('instrumentMode', 'IW'))
                    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
                    .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING')) 
                    .filter(ee.Filter.eq('resolution_meters', 10))
                    .filterBounds(geometry)
                    .select('VH')
;

// col = col.map(function(img) {
//   var doy = ee.Date(img.get('system:time_start')).getRelative('month', 'year');
//   return img.set('doy', doy);
// }
// );

// var distictDOY = col.filterDate('2021-09-01', '2022-01-31');
// var filter = ee.Filter.equals({leftField: 'doy', rightField: 'doy'});
// var join = ee.Join.saveAll('doy_matches');
// var joinCol = ee.ImageCollection(join.apply(distictDOY, col, filter));

// var comp = joinCol.map(function(img) {
//   var doyCol = ee.ImageCollection.fromImages(
//     img.get('doy_matches')
//     );
//     return doyCol.reduce(ee.Reducer.median());
// });

// var days = ee.List.sequence(2,30,12);
var years = ee.List.sequence(2021, 2022, 1);
var months = ee.List.sequence(9,12,1,4);

var col =  ee.ImageCollection.fromImages(
  years.map(function (y) {
    return months.map(function(m){
      var start = ee.Date.fromYMD(y,m,1).advance(-1,"month");
      var end = ee.Date.fromYMD(y,m,1).advance(1,"month");
      var w = col.filterDate(start,end).max();    
                    
      return w.set('year', y)
              .set('month', m)
              .set('system:time_start',start);
  })}).flatten()
);

var visParams = {min: -29.264204107025904, max: -8.938093778644141}

// Add Text
var txt = require('users/gena/packages:text')

var textProperties = {
  fontSize: 32,
  textColor: 'ffffff',
  outlineColor: '000000',
  outlineWidth: 0,
  outlineOpacity: 0.6
};

var label = 'VH'
var scale = Map.getScale() * 1;
var geometryLabel = geomLabel;

// var gifVis = comp.map(function(img) {
//   return img.visualize(visParams).clip(geometry);
// });

var gifVis = col.map(function(img) {
  var y = ee.Number(img.get("year")).toInt()
  var m = ee.Number(img.get("month")).toInt()
  var label = ee.String(y).cat("-").cat(m)
  var text = txt.draw(label, geometryLabel, scale, {fontSize: 32});
  return img.visualize(visParams).clip(geometry).blend(text);
});

print(gifVis);

var gifParams = {
  'region': geometry,
  'dimensions': 600,
  'framesPerSecond': 3
};

print(gifVis.getVideoThumbURL(gifParams));
print(ui.Thumbnail(gifVis, gifParams));
