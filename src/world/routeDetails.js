import { createAlpeDetailKit, createAlpeMasonryMaterial, createAlpeWornRoadMap, addAlpeRoadDetails } from './alpeRouteDetails.js';

// The same geometry and placement rules serve presets and imported GPX worlds.
// Route-specific Dutch flags and crowd audio are still owned by Alpe d'Huez.
export function createRouteDetailKit(quality, alpine) {
  return createAlpeDetailKit(quality, { locale: 'en', alpine });
}

export const createRouteMasonryMaterial = createAlpeMasonryMaterial;
export const createWornRoadMap = createAlpeWornRoadMap;

export function addRouteRoadDetails(getChunk, samples, totalDistanceM, quality, options) {
  return addAlpeRoadDetails(getChunk, samples, totalDistanceM, quality, options);
}
