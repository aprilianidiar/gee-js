/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var danube = ee.FeatureCollection("users/aprilia_gicait/Danube-River");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var objects = ee.data.listAssets('projects/sat-io/open-datasets/MSBuildings')
print('Assets in MS Global Buildings Footprint Folder', objects['assets'])
print('Total Buildings', ee.FeatureCollection('projects/sat-io/open-datasets/MSBuildings/Romania').size())

var feature = ee.FeatureCollection('projects/sat-io/open-datasets/MSBuildings/Romania')
Map.addLayer(feature.style({fillColor: '00000000',color: 'FF5500'}),{},'Romania', 1)
Map.addLayer(danube ,{color: 'blue'}, 'Danube', 1)
