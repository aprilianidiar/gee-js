/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var dem = ee.Image("USGS/SRTMGL1_003"),
    swater = ee.Image("JRC/GSW1_4/GlobalSurfaceWater"),
    S1 = ee.ImageCollection("COPERNICUS/S1_GRD"),
    L8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_TOA"),
    S2 = ee.ImageCollection("COPERNICUS/S2"),
    bounds = 
    /* color: #ffc82d */
    /* shown: false */
    ee.Geometry.Polygon(
        [[[92.10690997753609, 21.178041708074392],
          [92.10690997753609, 21.01981036555175],
          [92.30397723827828, 21.01981036555175],
          [92.30397723827828, 21.178041708074392]]], null, false),
    center = 
    /* color: #d63000 */
    /* shown: false */
    ee.Geometry.Point([92.20624815154217, 21.096418824471815]);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// Source: Hamidi et al., 2022 (Fast Flood Extent Monitoring with SAR Change Detection Using Google Earth Engine)

// Changing the study area - change "bounds" parameter

// Set parameters beforehand
// [before_start,before_end,after_start,after_end,k_ndfi,k_ri,k_diff,mndwi_threshold]
var params = ['2023-04-01','2023-05-01','2023-05-01','2023-05-18',1.0,0.25,0.8,0.4];

// SAR Input Data 
var before_start = params[0];
var before_end = params[1];

var after_start = params[2];
var after_end = params[3];

var polarization = "VH";
var pass_direction = "ASCENDING";

// k Coeficient Values for NDFI, RI and DII SAR Indices (Flooded Pixel Thresholding; Equation 4)
var k_ndfi = params[4];
var k_ri = params[5];
var k_diff = params[6];

// MNDWI flooded pixels Threshold Criteria
var mndwi_threshold = params[7];

// Datasets -----------------------------------
var dem = ee.Image("USGS/SRTMGL1_003").select('elevation');
var slope = ee.Terrain.slope(dem);
var swater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('seasonality');
// Applying dataset from SAR - Sentinel 1 
var collection = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', polarization))
  .filter(ee.Filter.eq('orbitProperties_pass', pass_direction)) 
  .filter(ee.Filter.eq('resolution_meters', 10))
  .filterBounds(bounds)
  .select(polarization);
var before = collection.filterDate(before_start, before_end); //before disaster - PRE
var after = collection.filterDate(after_start, after_end); //during or after disaster - POST
print("before", before);
print("after", after);

// Generating Reference and Flood Multi-temporal SAR Data ------------------------
// Mean Before and Min After ------------------------
var mean_before = before.mean().clip(bounds);
var min_after = after.min().clip(bounds);
var max_after = after.max().clip(bounds);
var mean_after = after.mean().clip(bounds);

Map.addLayer(mean_before, {min: -29.264204107025904, max: -8.938093778644141, palette: []}, "mean_before",0);
Map.addLayer(min_after, {min: -29.29334290990966, max: -11.928313976797138, palette: []}, "min_after",1);

//---------------------------------- Step 1--------------------------------------------------------
//-------------------------------------------------------------------------------------------------

// Flood identification ------------------------
// NDFI ------------------------
var ndfi = mean_before.abs().subtract(min_after.abs())
  .divide(mean_before.abs().add(min_after.abs()));
var ndfi_filtered = ndfi.focal_mean({radius: 50, kernelType: 'circle', units: 'meters'});

// NDFI Normalization -----------------------
var ndfi_min = ndfi_filtered.reduceRegion({
  reducer: ee.Reducer.min(),
  geometry: bounds,
  scale: 15,
  maxPixels: 1e13
});
var ndfi_max = ndfi_filtered.reduceRegion({
  reducer: ee.Reducer.max(),
  geometry: bounds,
  scale: 15,
  maxPixels: 1e13
});

var ndfi_rang = ee.Number(ndfi_max.get('VH')).subtract(ee.Number(ndfi_min.get('VH')));
var ndfi_subtctMin = ndfi_filtered.subtract(ee.Number(ndfi_min.get('VH')));
var ndfi_norm = ndfi_subtctMin.divide(ndfi_rang);

Map.addLayer(ndfi_norm, {min: 0.3862747346632676, max: 0.7632898395906615}, "ndfi_norm",0);

var histogram = ui.Chart.image.histogram({
  image: ndfi_norm,
  region: bounds,
  scale: 15,
  maxPixels: 1e13
});
print("NDFI Normalized Histogram", histogram);

// NDFI Thresholding ------------------------
var ndfi_mean = ndfi_norm.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: bounds,
  scale: 15,
  maxPixels: 1e13
});

var ndfi_std = ndfi_norm.reduceRegion({
  reducer: ee.Reducer.stdDev(),
  geometry: bounds,
  scale: 15,
  maxPixels: 1e13
});

var ndfi_th = ee.Number(ndfi_mean.get('VH')).subtract(ee.Number(k_ndfi).multiply(ee.Number(ndfi_std.get('VH'))));
print('NDFI Tresholding = ', ndfi_th);

// Apply Thresholding Value on NDFI
var ndfi_filtered = ndfi_norm.lt(ndfi_th); //Image.lt for masking

// NDFI Masking -------------------------------------
var swater_mask = swater.gte(4);
var slope_mask = slope.lt(5);
var swater_clip = swater_mask.clip(bounds);

var ndfi_flooded_masked = ndfi_filtered.where(swater_mask, 0)
  .updateMask(slope_mask.eq(1));
var connections = ndfi_flooded_masked.connectedPixelCount().gte(25);
ndfi_flooded_masked = ndfi_flooded_masked.updateMask(connections.eq(1));
var ndfi_flood = ndfi_flooded_masked.updateMask(ndfi_flooded_masked.eq(1));

//------------------------------------------------------------------------
// RI ------------------------
var ri = min_after.abs().divide(mean_before.abs());
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

var ri_rang = ee.Number(ri_max.get('VH')).subtract(ee.Number(ri_min.get('VH')));
var ri_subtctMin = ri_filtered.subtract(ee.Number(ri_min.get('VH')));
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

var ri_th = ee.Number(ri_mean.get('VH')).add(ee.Number(k_ri).multiply(ee.Number(ri_std.get('VH'))));
print('RI Tresholding = ', ri_th);

// Apply Thresholding on RI
var ri_filtered = ri_norm.gt(ri_th);

// RI Masking -------------------------------------
var ri_masked = ri_filtered
  .where(swater_mask, 0)
  .updateMask(slope_mask.eq(1));
var ri_connections = ri_masked.connectedPixelCount().gte(25);
ri_masked = ri_masked.updateMask(ri_connections.eq(1));
var ri_flood = ri_masked.updateMask(ri_masked.eq(1));

//------------------------------------------------------------------------
// DII ------------------------
var diff_image = min_after.abs().subtract(mean_before.abs());
var diff_image_filtered = diff_image.focal_mean({radius: 50, kernelType: 'circle', units: 'meters'});

// DII Normalization
var diff_image_min = diff_image_filtered.reduceRegion({
  reducer: ee.Reducer.min(),
  geometry: bounds,
  scale: 15,
  maxPixels: 1e13
});

var diff_image_max = diff_image_filtered.reduceRegion({
  reducer: ee.Reducer.max(),
  geometry: bounds,
  scale: 15,
  maxPixels: 1e13
});

var diff_image_rang = ee.Number(diff_image_max.get('VH')).subtract(ee.Number(diff_image_min.get('VH')));
var diff_image_subtctMin = diff_image_filtered.subtract(ee.Number(diff_image_min.get('VH')));
var diff_image_norm = diff_image_subtctMin.divide(diff_image_rang);

Map.addLayer(diff_image_norm, {min: 0.1434809241093373, max: 0.7689478379887918}, "diff_image_norm", 0);

var histogram = ui.Chart.image.histogram({
  image: diff_image_norm,
  region: bounds,
  scale: 15,
  maxPixels: 1e13
});
print("Difference Image Index Histogram", histogram);

// DII Thresholding ------------------------
var diff_image_mean = diff_image_norm.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: bounds,
  scale: 15,
  maxPixels: 1e13
});

var diff_image_std = diff_image_norm.reduceRegion({
  reducer: ee.Reducer.stdDev(),
  geometry: bounds,
  scale: 15,
  maxPixels: 1e13
});

var diff_image_th = ee.Number(diff_image_mean.get('VH')).add(ee.Number(k_diff).multiply(ee.Number(diff_image_std.get('VH'))));
print('Difference Image Index Tresholding = ', diff_image_th);

// Apply Thresholding on DII
var diff_image_filtered = diff_image_norm.gt(diff_image_th);

// DII Masking -------------------------------------
var diff_image_masked = diff_image_filtered.where(swater_mask, 0)
  .updateMask(slope_mask.eq(1));
var diff_image_connections = diff_image_masked.connectedPixelCount().gte(25);
diff_image_masked = diff_image_masked.updateMask(diff_image_connections.eq(1));
var diff_image_flood = diff_image_masked.updateMask(diff_image_masked.eq(1));

//---------------------------------- Step 2--------------------------------------------------------
//-------------------------------------------------------------------------------------------------
// Validation Using Sentinel-2 Surface Reflectance Imagery Data -----------------------------------
var sentinel2_ref = ee.ImageCollection("COPERNICUS/S2")
  .filterBounds(bounds).filterDate('2022-11-01', '2022-12-11'); //take with the clearest range '2022-11-01', '2022-12-11'
print(sentinel2_ref,"sentinel2_ref");
var sentinel2_ref_mosaic = sentinel2_ref.mosaic();
var sentinel2_ref_clip = sentinel2_ref_mosaic.clip(bounds);

var sentinel2_flood = ee.ImageCollection("COPERNICUS/S2")
  .filterBounds(bounds).filterDate('2023-05-20', '2023-05-30'); //take flood suspectibility
print(sentinel2_flood,"sentinel2_flood");
var sentinel2_flood_mosaic = sentinel2_flood.mosaic();
var sentinel2_flood_clip = sentinel2_flood_mosaic.clip(bounds);

// Check on the cloud cover (1)
Map.addLayer(sentinel2_ref_clip,{min:0,max:2500,bands:['B4','B3','B2']},
    'true color sentinel2_ref_clip',0);
Map.addLayer(sentinel2_flood_clip,{min:0,max:2500,bands:['B4','B3','B2']},
    'true color sentinel2_clip',0);

// Cloud Covers and Cloud Shadows Masks
var qa = sentinel2_flood_clip.select('QA60');
var radix = 2 ;
var cloudBit = 10 ; // this number can be found in the pixel_qa Bitmask metadata
var shadowBit = 11 ;
var clouds_1 = qa.bitwiseAnd(Math.pow(radix,cloudBit)).neq(0).rename('clouds');
var clouds_2 = qa.bitwiseAnd(Math.pow(radix,shadowBit)).neq(0).rename('shadows');

Map.addLayer(clouds_1.updateMask(clouds_1.eq(1)),{palette:'crimson'},'clouds [mc]',0);
Map.addLayer(clouds_2.updateMask(clouds_2.eq(1)),{palette:'gold'},'shadows [mc]',0);

var cloudsMasked = sentinel2_flood_clip.updateMask(clouds_1.eq(0).and(clouds_2.eq(0)));

// Calculating MNDWI for Optical imagery--------------------------------------------------------------
var green_s2 = cloudsMasked.select('B3');
var swir1_s2 = cloudsMasked.select('B11'); 
var swir2_s2 = cloudsMasked.select('B12');

var mndwi_s2 = green_s2.subtract(swir1_s2).divide(green_s2.add(swir1_s2)).rename('mndwi_s2');

var mndwi_masked = mndwi_s2.where(swater_mask, 0);
Map.addLayer(mndwi_masked,{min:-0.5446808338165283,max:0.9092437028884888,palette:['02991c','37a3ff','ff822a']},'mndwi_masked',0);

var mndwi_filtered = mndwi_masked.gt(mndwi_threshold);
var mndwi_connections = mndwi_filtered.connectedPixelCount().gte(25);
mndwi_filtered = mndwi_filtered.updateMask(mndwi_connections.eq(1));

var mndwi_flood = mndwi_filtered.updateMask(mndwi_filtered.eq(1));

// Display flood suspectbility after masked with water-----------------------------------
Map.addLayer(swater_clip, {palette: ['20cbdc']}, "Open Waters", 0);

Map.addLayer(ndfi_flood, {palette: 'red'}, 'ndfi_flood',0);
Map.addLayer(ri_flood, {palette: '00bee9'}, "ri_flood",0);
Map.addLayer(diff_image_flood, {palette: 'brown'}, "diff_image_flood",0);
Map.addLayer(mndwi_flood, {palette: 'ff822a'}, "mndwi_flood", 0);

Map.setOptions('HYBRID');
// Map.setCenter(91.99, 21.44, 13);
Map.centerObject(bounds, 11);

//---------------------------------- Step 3--------------------------------------------------------
//-------------------------------------------------------------------------------------------------

// NDFI Pixel Analysis -----------------------------------
// Removing Cloud Covers and Cloud Shadows from NDFI flood inundation layers
var ndfi_flood_RemCloud = ndfi_flood.updateMask(clouds_1.eq(0).and(clouds_2.eq(0)));

var undcldfld_ndfi = ndfi_flood_RemCloud.mask().clip(bounds)
  .add(ndfi_flood.mask().remap([0,1],[0,5]))
  .rename('flood_compare');
undcldfld_ndfi = undcldfld_ndfi.remap([0,1,3,5,6,8,9],[0,1,2,3,4,5,6]);
undcldfld_ndfi = undcldfld_ndfi.updateMask(undcldfld_ndfi.gt(0));

var undcldfld_ndfi_pixels = ndfi_flood.updateMask(undcldfld_ndfi.eq(3));
var num_undcldfld_ndfi_pixels = undcldfld_ndfi_pixels.reduceRegion({
  reducer: ee.Reducer.sum(),              
  geometry: bounds,
  scale: 15, // native resolution 
  maxPixels: 1e9,
  bestEffort: true
  });

Map.addLayer(undcldfld_ndfi_pixels,{palette:['ceff0c']},'undcldfld_ndfi', 0);
print("num_undcldfld_ndfi_pixels", num_undcldfld_ndfi_pixels);

var compare_ndfi = ndfi_flood_RemCloud.mask().clip(bounds)
  .add(mndwi_flood.mask().remap([0,1],[0,5]))
  .rename('flood_compare');
compare_ndfi = compare_ndfi.remap([0,1,3,5,6,8,9],[0,1,2,3,4,5,6]);
compare_ndfi = compare_ndfi.updateMask(compare_ndfi.gt(0));
Map.addLayer(compare_ndfi,{min:0,max:4,palette:['dadada','0400ff','ff0000','fbff00']},'compare_ndfiANDmndwi', 0);

var mndwi_pixels = mndwi_flood.updateMask(compare_ndfi.eq(3));

Map.addLayer(mndwi_pixels,{},'mndwi_pixels', 0);
var num_mndwi_pixels = mndwi_pixels.reduceRegion({
  reducer: ee.Reducer.sum(),              
  geometry: bounds,
  scale: 15, // native resolution 
  maxPixels: 1e9,
  bestEffort: true
  });
print("num_mndwi_pixels", num_mndwi_pixels);

var ndfi_pixels = ndfi_flood_RemCloud.updateMask(compare_ndfi.eq(1));
Map.addLayer(ndfi_pixels,{},'ndfi_pixels', 0);
var num_ndfi_pixels = ndfi_pixels.reduceRegion({
  reducer: ee.Reducer.sum(),              
  geometry: bounds,
  scale: 15, // native resolution 
  maxPixels: 1e9,
  bestEffort: true
  });
print("num_ndfi_pixels", num_ndfi_pixels);

var ndfiAndmndwi_pixels = ndfi_flood_RemCloud.updateMask(mndwi_flood);

Map.addLayer(ndfiAndmndwi_pixels,{},'ndfiAndmndwi_pixels', 0);
var num_ndfiAndmndwi_pixels = ndfiAndmndwi_pixels.reduceRegion({
  reducer: ee.Reducer.sum(),              
  geometry: bounds,
  scale: 15, // native resolution 
  maxPixels: 1e9,
  bestEffort: true
  });
print("num_ndfiAndmndwi_pixels", num_ndfiAndmndwi_pixels);

var ToAgre_Percent_ndfi = ee.Number(num_ndfiAndmndwi_pixels.get('VH'))
.divide(ee.Number(num_ndfiAndmndwi_pixels.get('VH')).add(ee.Number(num_ndfi_pixels.get('VH'))
.add(ee.Number(num_mndwi_pixels.get('mndwi_s2')))));
print("Total Agreement % NDFI", ToAgre_Percent_ndfi);

var Agr_Percentage_ndfi = ee.Number(num_ndfiAndmndwi_pixels.get("VH"))
.divide(ee.Number(num_mndwi_pixels.get("mndwi_s2")).add(ee.Number(num_ndfiAndmndwi_pixels.get("VH"))));
print("Agreement % NDFI = ", Agr_Percentage_ndfi);


// RI Pixel Analysis -----------------------------------
// Removing Cloud Covers and Cloud Shadows from RI flood inundation layers
var ri_flood_RemCloud = ri_flood.updateMask(clouds_1.eq(0).and(clouds_2.eq(0)));

var undcldfld_ri = ri_flood_RemCloud.mask().clip(bounds)
  .add(ri_flood.mask().remap([0,1],[0,5]))
  .rename('flood_compare');
undcldfld_ri = undcldfld_ri.remap([0,1,3,5,6,8,9],[0,1,2,3,4,5,6]);
undcldfld_ri = undcldfld_ri.updateMask(undcldfld_ri.gt(0));

var undcldfld_ri_pixels = ri_flood.updateMask(undcldfld_ri.eq(3));
var num_undcldfld_ri_pixels = undcldfld_ri_pixels.reduceRegion({
  reducer: ee.Reducer.sum(),              
  geometry: bounds,
  scale: 15, // native resolution 
  maxPixels: 1e9,
  bestEffort: true
  });

Map.addLayer(undcldfld_ri_pixels,{palette:['fbff00']},'undcldfld_ri', 0);
print("num_undcldfld_ri_pixels", num_undcldfld_ri_pixels);

var compare_ri = ri_flood_RemCloud.mask().clip(bounds)
  .add(mndwi_flood.mask().remap([0,1],[0,5]))
  .rename('flood_compare');
compare_ri = compare_ri.remap([0,1,3,5,6,8,9],[0,1,2,3,4,5,6]);
compare_ri = compare_ri.updateMask(compare_ri.gt(0));
Map.addLayer(compare_ri,{min:0,max:4,palette:['dadada','0400ff','ff0000','00d0ff']},'compare_riANDmndwi', 0);

var ri_mndwi_pixels = mndwi_flood.updateMask(compare_ri.eq(3));
Map.addLayer(ri_mndwi_pixels,{},'ri_mndwi_pixels', 0);
var num_ri_mndwi_pixels = ri_mndwi_pixels.reduceRegion({
  reducer: ee.Reducer.sum(),              
  geometry: bounds,
  scale: 15, // native resolution 
  maxPixels: 1e9,
  bestEffort: true
  });
print("num_ri_mndwi_pixels", num_ri_mndwi_pixels);

var ri_pixels = ri_flood_RemCloud.updateMask(compare_ri.eq(1));
Map.addLayer(ri_pixels,{},'ri_pixels', 0);
var num_ri_pixels = ri_pixels.reduceRegion({
  reducer: ee.Reducer.sum(),              
  geometry: bounds,
  scale: 15, // native resolution 
  maxPixels: 1e9,
  bestEffort: true
  });
print("num_ri_pixels", num_ri_pixels);

var riAndmndwi_pixels = ri_flood_RemCloud.updateMask(mndwi_flood);

Map.addLayer(riAndmndwi_pixels,{},'riAndmndwi_pixels', 0);
var num_riAndmndwi_pixels = riAndmndwi_pixels.reduceRegion({
  reducer: ee.Reducer.sum(),              
  geometry: bounds,
  scale: 15, // native resolution 
  maxPixels: 1e9,
  bestEffort: true
  });
print("num_riAndmndwi_pixels", num_riAndmndwi_pixels);

var ToAgre_Percent_ri = ee.Number(num_riAndmndwi_pixels.get('VH'))
.divide(ee.Number(num_riAndmndwi_pixels.get('VH')).add(ee.Number(num_ri_pixels.get('VH'))
.add(ee.Number(num_ri_mndwi_pixels.get('mndwi_s2')))));
print("Total Agreement % RI", ToAgre_Percent_ri);

var Agr_Percentage_ri = ee.Number(num_riAndmndwi_pixels.get("VH"))
.divide(ee.Number(num_ri_mndwi_pixels.get("mndwi_s2")).add(ee.Number(num_riAndmndwi_pixels.get("VH"))));
print("Agreement % RI = ", Agr_Percentage_ri);

// DII Pixel Analysis -----------------------------------
// Removing Cloud Covers and Cloud Shadows from DII flood inundation layers
var diff_flood_RemCloud = diff_image_flood.updateMask(clouds_1.eq(0).and(clouds_2.eq(0)));

var undcldfld_diff = diff_flood_RemCloud.mask().clip(bounds)
  .add(diff_image_flood.mask().remap([0,1],[0,5]))
  .rename('flood_compare');
undcldfld_diff = undcldfld_diff.remap([0,1,3,5,6,8,9],[0,1,2,3,4,5,6]);
undcldfld_diff = undcldfld_diff.updateMask(undcldfld_diff.gt(0));

var undcldfld_diff_pixels = diff_image_flood.updateMask(undcldfld_diff.eq(3));
var num_undcldfld_diff_pixels = undcldfld_diff_pixels.reduceRegion({
  reducer: ee.Reducer.sum(),              
  geometry: bounds,
  scale: 15, // native resolution 
  maxPixels: 1e9,
  bestEffort: true
  });

Map.addLayer(undcldfld_diff_pixels,{palette:['ceff0c']},'undcldfld_diff_pixels', 0);
print("num_undcldfld_diff_pixels", num_undcldfld_diff_pixels);

var compare_dii = diff_flood_RemCloud.mask().clip(bounds)
  .add(mndwi_flood.mask().remap([0,1],[0,5]))
  .rename('flood_compare');
compare_dii = compare_dii.remap([0,1,3,5,6,8,9],[0,1,2,3,4,5,6]);
compare_dii = compare_dii.updateMask(compare_dii.gt(0));
Map.addLayer(compare_dii,{min:0,max:4,palette:['dadada','0400ff','ff0000','fbff00']},'compare_diiANDmndwi', 1);

Export.image.toDrive({
  image: compare_dii,
  description: 'compare_dii_bangladesh',
  scale: 10,
  region: bounds,
  maxPixels: 1e12
});

//flash flood detected here -------------------------------------------------^^^^

var dii_mndwi_pixels = mndwi_flood.updateMask(compare_dii.eq(3));
Map.addLayer(dii_mndwi_pixels,{},'dii_mndwi_pixels', 0);
var num_dii_mndwi_pixels = dii_mndwi_pixels.reduceRegion({
  reducer: ee.Reducer.sum(),              
  geometry: bounds,
  scale: 15, // native resolution 
  maxPixels: 1e9,
  bestEffort: true
  });
print("num_dii_mndwi_pixels", num_dii_mndwi_pixels);

var dii_pixels = diff_flood_RemCloud.updateMask(compare_dii.eq(1));
Map.addLayer(dii_pixels,{},'dii_pixels', 0);
var num_dii_pixels = dii_pixels.reduceRegion({
  reducer: ee.Reducer.sum(),              
  geometry: bounds,
  scale: 15, // native resolution 
  maxPixels: 1e9,
  bestEffort: true
  });
print("num_dii_pixels", num_dii_pixels);

var diiAndmndwi_pixels = diff_flood_RemCloud.updateMask(mndwi_flood);
Map.addLayer(diiAndmndwi_pixels,{},'diiAndmndwi_pixels', 0);
var num_diiAndmndwi_pixels = diiAndmndwi_pixels.reduceRegion({
  reducer: ee.Reducer.sum(),              
  geometry: bounds,
  scale: 15, // native resolution 
  maxPixels: 1e9,
  bestEffort: true
  });
print("num_diiAndmndwi_pixels", num_diiAndmndwi_pixels);

var ToAgre_percent_dii = ee.Number(num_diiAndmndwi_pixels.get('VH'))
.divide(ee.Number(num_diiAndmndwi_pixels.get('VH')).add(ee.Number(num_dii_pixels.get('VH'))
.add(ee.Number(num_dii_mndwi_pixels.get('mndwi_s2')))));
print("Total Agreeemnt % DII", ToAgre_percent_dii);

var Agr_Percentage_dii = ee.Number(num_diiAndmndwi_pixels.get("VH"))
.divide(ee.Number(num_dii_mndwi_pixels.get("mndwi_s2")).add(ee.Number(num_diiAndmndwi_pixels.get("VH"))));
print("Agreement % DII = ", Agr_Percentage_dii);

//------------------------------------------------------------------------
//Adding Legend -----------------------------------
// set position of panel
var legend = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px 15px'
  }
});

// Create legend title
var legendTitle = ui.Label({
//  value: 'Legend',
  style: {
    fontWeight: 'bold',
    fontSize: '18px',
    margin: '0 0 4px 0',
    padding: '0'
    }
});

// Add the title to the panel
legend.add(legendTitle);

var makeRow = function(color, name) {

      // Create the label that is actually the colored box.
      var colorBox = ui.Label({
        style: {
          backgroundColor: '#' + color,
          // Use padding to give the box height and width.
          padding: '8px',
          margin: '0 0 4px 0'
        }
      });

      // Create the label filled with the description text.
      var description = ui.Label({
        value: name,
        style: {margin: '0 0 4px 6px'}
      });

      // return the panel
      return ui.Panel({
        widgets: [colorBox, description],
        layout: ui.Panel.Layout.Flow('horizontal')
      });
};

//  Palette with the colors
var palette =['0400ff','fbff00','ff0000','00d0ff'];

// name of the legend
var names = ['Only RI','Under Cloud RI', 'Only MNDWI', 'Agreement' ];

// Add color and and names
for (var i = 0; i < 4; i++) {
  legend.add(makeRow(palette[i], names[i]));
  }  

// add legend to map (alternatively you can also print the legend to the console)
Map.add(legend);

// generate an assetID 
var outputName = ee.String('Sentinel-2').cat('2022-01-01').getInfo();
