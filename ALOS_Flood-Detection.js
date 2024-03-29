/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var alos = ee.ImageCollection("JAXA/ALOS/PALSAR-2/Level2_2/ScanSAR"),
    dsm = ee.ImageCollection("JAXA/ALOS/AW3D30/V3_2"),
    bounds = ee.FeatureCollection("users/aprilia_gicait/MOCHA_ROI_BGD"),
    dem = ee.Image("NASA/NASADEM_HGT/001"),
    post1 = ee.Image("users/aprilia_gicait/ALOS_HH_POST_MOCHA"),
    post2 = ee.Image("users/aprilia_gicait/ALOS_HH_POST_MOCHA_2"),
    pre1 = ee.Image("users/aprilia_gicait/ALOS_HH_PRE_MOCHA"),
    pre2 = ee.Image("users/aprilia_gicait/ALOS_HH_PRE_MOCHA_2");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// Import ALOS Data---------------------------------
var dataset = ee.ImageCollection('JAXA/ALOS/PALSAR-2/Level2_2/ScanSAR')
                .filter(ee.Filter.date('2022-05-01','2022-06-22'))
                .filterBounds(bounds)
;
var HH = dataset.select(['HH']);
var mosaic = HH.mosaic();
var clip = mosaic.clip(bounds);

print ('ALOS Image', HH);

Map.addLayer (HH, {min: 0, max: 8000}, 'ALOS', 0);

// Import Water Data--------------------------------
var water = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
              .select(['occurrence'])
;

Map.addLayer(water, {min:0.0, max: 100.0, palette:['ffffff', 'ffbbbb', '0000ff']}, 'Water Occurence', 0);

// Import DEM to Slope
var dem = ee.Image('NASA/NASADEM_HGT/001')
            .select('elevation')
;

print ('Terrain Image', dem);

var slope = ee.Terrain.slope(dem);
var slope_clip = slope.clip(bounds);
Map.addLayer(slope_clip, {min: 0, max: 89.99}, 'Slope', 0);

// ----------------------------------------------------------------------------------------
// Calculate RI to Imported ALOS-MOCHA
// Mosaic each images
var pre1_masked = pre1.updateMask(pre1);
var pre2_masked = pre2.updateMask(pre2);
var pre_img = ee.ImageCollection([pre1_masked, pre2_masked])
                .mosaic()
;

var post1_masked = post1.updateMask(post1);
var post2_masked = post2.updateMask(post2);
var post_img = ee.ImageCollection ([post1_masked, post2_masked])
                 .mosaic()
;

Map.addLayer(pre_img, {min: 0, max: 8000}, 'PRE Image', 0);
Map.addLayer(post_img, {min: 0, max: 8000}, 'PRE Image', 1);

// ----------------------------------------------------------------------------------------
// Get the RI calculation for Flash Flood
var min_after = post_img.focalMin().clip(bounds);
var mean_before = pre_img.focalMean().clip(bounds);
var k_ri = 0.25;

var ri = min_after.abs().divide(mean_before.abs()); // 
var ri_filtered = ri.focal_mean({radius: 50, kernelType: 'circle', units: 'meters'});

// RI Normalization -----------------------
var ri_min = ri_filtered.reduceRegion({
  reducer: ee.Reducer.min(),
  geometry: bounds,
  scale: 15,
  maxPixels: 1e13
});

var ri_max = ri_filtered.reduceRegion({
  reducer: ee.Reducer.max(),
  geometry: bounds,
  scale: 15,
  maxPixels: 1e13
});

var ri_rang = ee.Number(ri_max.get('b1')).subtract(ee.Number(ri_min.get('b1')));
var ri_subtctMin = ri_filtered.subtract(ee.Number(ri_min.get('b1')));
var ri_norm = ri_subtctMin.divide(ri_rang);

Map.addLayer(ri_norm, {min: 0.02946113630948349, max: 0.14605562985795736}, "ri_norm", 0);

var histogram = ui.Chart.image.histogram({
  image: ri_norm,
  region: bounds,
  scale: 15,
  maxPixels: 1e13
});
print("RI Normalized Histogram", histogram);

// RI Thresholding ------------------------
var ri_mean = ri_norm.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: bounds,
  scale: 15,
  maxPixels: 1e13
});

var ri_std = ri_norm.reduceRegion({
  reducer: ee.Reducer.stdDev(),
  geometry: bounds,
  scale: 15,
  maxPixels: 1e13
});

var ri_th = ee.Number(ri_mean.get('b1')).add(ee.Number(k_ri).multiply(ee.Number(ri_std.get('b1'))));
print('RI Tresholding = ', ri_th);

// Apply Thresholding on RI
var ri_filtered = ri_norm.gt(ri_th);

// RI Masking -------------------------------------
var ri_masked = ri_filtered
  .where(water, 0)
  .updateMask(slope.eq(1));
var ri_connections = ri_masked.connectedPixelCount().gte(25);
ri_masked = ri_masked.updateMask(ri_connections.eq(1));
var ri_flood = ri_masked.updateMask(ri_masked.eq(1));

Map.addLayer(bounds, {palette: ['black']}, 'ROI', 0);
Map.addLayer(ri_flood, {palette: '00bee9'}, 'ri_flood', 0);

Map.centerObject (bounds, 8);

// Conclusions: flash flood detection cannot be developed using ALOS with 'HH' or 'HV' polarization.
// Flash flood in using Sentinel-1 only applicable to 'VH' polarization

// Get NDFI Calculation for the Flash Flood
