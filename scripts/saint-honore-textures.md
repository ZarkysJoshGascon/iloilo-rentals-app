# Saint Honore Unit 9S walkthrough finishes

The 3D scroll tour on `/interior-design` uses the two local Unit 9S boards:

- `tour-source/Saint Honore unit 9S1.png`
- `tour-source/Saint Honore Unit9S2.png`

These source boards are ignored by Git. The deployable assets are stored in
`public/tours/saint-honore-9s/tex/`.

## Wallpaper assets

Both assets were reconstructed from the references with the built-in imagegen
tool, then encoded as JPEG at quality 92 without resizing. They are
interpretations of the source wallpaper, rather than the original manufacturer's
texture. The previous artwork files remain available.

- `blossom-9s.jpg`: 1024 × 1536; sofa, dining, media, and lattice-adjacent panels.
- `blossom-9s-wide.jpg`: 2172 × 724; continuous bedroom wallpaper band.

The scene calculates each image's actual aspect ratio and crops to fill each
panel. The bedroom panorama is cropped vertically rather than stretched or
mirrored. Paper normal and roughness maps repeat independently at 0.35 m, so
the paper grain remains the same physical size on every wall.

### Portrait generation prompt

Input images: both original Unit 9S boards, in the order listed above.

```text
Use case: precise-object-edit. Asset type: high-resolution diffuse/albedo texture for the cherry-blossom feature wallpaper in a Three.js interior walkthrough. Input images 1 and 2 are the Saint Honore Unit 9S architect reference sheets. Reconstruct ONLY the cherry-blossom wallpaper seen on their dining, sofa, bedroom, and lattice-adjacent feature walls, as one clean sharp front-facing rectangular wallpaper sample. Match the distinctive thin twisting dark charcoal-brown branches, numerous small ivory-white and muted dusty-pink cherry blossoms, tiny reddish buds, and textured warm silver-grey/greige lightly metallic paper ground. Branches should remain elegant, winding, relatively fine rather than thick tree trunks. Faithfully follow the artwork in the references, particularly the tall unobstructed panel beside the lattice in reference image 2. Portrait 2:3 composition, edge-to-edge flat texture with crisp intricate petals and fine fibrous paper detail. Neutral even diffuse illumination, no lighting baked into edges, no gradients, no cast shadows, no room, furniture, plants, frame, border, grid, text, logo, perspective, or vignette. This output will cover a 1.25 m wide by 2.4 m high wall and also be cropped for other wall panels. Reconstruct the actual surface with high detail, not a new room render.
```

### Bedroom generation prompt

Input images: the first original Unit 9S board and the generated portrait texture.

```text
Use case: precise-object-edit. Asset type: panoramic albedo texture for the bedroom wallpaper strip in a Three.js Saint Honore Unit 9S walkthrough. Input image 1 is the Unit 9S reference sheet: use the wallpaper above the bedroom headboard in its upper right room, matching the same blossom wallpaper in the other rooms. Input image 2 is the already reconstructed wallpaper to match its crisp detail, materials, and colors. Reconstruct a single continuous WIDE LANDSCAPE 3:1 wallpaper sample, edge-to-edge with no border, of fine twisting charcoal-brown cherry-tree branches, small ivory-white and soft dusty pink blossoms, tiny red buds, on warm silver-grey/champagne greige lightly metallic textured paper. Spread irregular sweeping branches across the whole landscape frame, in the source mural's delicate scale. Branches and flowers should extend naturally through every edge. Preserve the detailed paper, branch, and petal appearance of image 2. This will be center-cropped to a 4.2:1 band across a bedroom wall; compose continuous organic artwork across the width with no central hero trunk. Neutral perfectly even diffuse light. No repeated or mirrored segments, no baked side lighting, no perspective, furniture, room, headboard, frame, shadows, text, logo, or vignette. Output only the sharp flat wallpaper texture, landscape orientation.
```

## Other finishes

`walkthrough/kit.ts` creates deterministic seamless colour/roughness maps for
ivory plaster, greige satin cabinetry, cream linen, grey wool upholstery, pale
knitted rugs, and brown velvet. Existing normal maps provide restrained relief;
fabric sheen supplies soft edge highlights. Data maps stay in linear colour
space, and all generated textures are tracked for disposal.

`tile` accepts metres as either a scalar or `[width, height]`. The floor uses
`[2.8, 1.9]`, giving the eight-board texture a roughly 24 cm plank width with
grain running across the unit, as in the source views. Its subtle cool tint,
roughness, and clearcoat match the boards' olive-brown timber and soft gloss.

No network-generated assets or texture processing is required at runtime.

## Furniture, planting, and balcony

The second pass uses softly domed, pinched-edge cushion geometry for the cream
sofa, ivory and cocoa pillows, upholstered headboard, mattress, and dining seats.
The duvet is a lightly folded surface with hanging edges. The dining chairs keep
the reference's slim white frames and cylindrical velvet backs; pendant globes
are smaller and the lighting uses a more neutral warm white.

Fine-leaved procedural trees replace the oversized imported money trees. Each
plant has an explicit furnishing-sized bound, and complete leaf instances that
would cross it are rejected. Leaves write depth and do not use transparent
sorting. Camera positions are constrained to clear aisles around the furniture.

The balcony is rebuilt from `tour-source/Saint Honore Unit 9S balcony view.jpg`:
black vertical-bar railings, pale tiled floor, glass bistro table, mesh chair,
tiered cake stand, and tea set. Its photographic exterior backdrop is
`public/tours/saint-honore-9s/balcony-city-view.jpg` (1672 × 941, JPEG quality 90).
The built-in imagegen tool removed the foreground furnishings from the source
photo and reconstructed the view behind them; this is a reference-based
reconstruction, not an exact unedited photograph. The final scene uses the
extended `public/tours/saint-honore-9s/balcony-city-panorama.jpg` (1672 × 941,
JPEG quality 90), mapped onto an inward-facing curved background covering 180°.
The closer final viewpoint includes the furniture without exposing a flat
backplate's side or bottom edges. The original reconstructed view is retained.

### Balcony generation prompt

Input image: the original Unit 9S balcony photograph.

```text
Use case: precise-object-edit. Asset: photographic daytime city-view backdrop for a 3D balcony recreation. Edit the supplied actual Saint Honore Unit 9S balcony photograph to remove ONLY the entire foreground balcony railing, chair, table, plates, kettle and cups, reconstructing the city/rooftops/trees naturally behind those removed foreground objects. Preserve the distinctive central glass office/hotel tower with its light vertical concrete strip, horizontal fins and right-side stacked facade, the lower pale buildings, green trees, distant low mountains and dramatic real blue sky with large white-grey clouds. Expand the view into a wide landscape 16:9 image. Faithfully retain the camera direction, tower identity, facade details, position, skyline and daytime color of the supplied photo; do not redesign or invent a new city. The image should be an unobstructed realistic exterior view from the ninth floor, horizon around middle-lower frame and tall glass tower just right of center. Even photographic clarity, no vignette, no frame, no foreground balcony fixtures, no furniture, no added text/logos. It will sit beyond a modeled black metal balcony railing, so there must be no railings baked into this image.
```

### Extended background generation prompt

Input images: the clean reconstructed city view and the original balcony photo.

```text
Use case: precise-object-edit / outpainting. Asset: extended photographic city backdrop for a 3D Saint Honore Unit 9S balcony walkthrough. Image 1 is the clean reconstructed city view; image 2 is the actual balcony reference. Keep the entire clean city view of image 1 at exactly its existing relative scale and composition in the CENTRAL rectangle occupying about the middle 50 percent of the output width AND middle 50 percent of its height. Expand the canvas to approximately TWICE its width and TWICE its height by outpainting equally left, right, above and below. Wide 16:9 output, approximately 2048x1152. This is OUTPAINTING, not zooming or scaling the city up: the distinctive glass tower must become proportionally about half as wide and half as tall within the final output canvas while remaining right of center within the preserved central scene. Preserve that tower's exact facade, white vertical concrete strip, dark horizontal fins, relative position, original clouds, green trees, rooftops, low buildings and distant mountains. Add believable matching city and roofs on both sides, more blue sky and dramatic soft white-grey clouds above, and plausible lower portions of the pale foreground buildings/roofs and tree-lined streets below. Match the original ninth-floor viewpoint and natural daytime photographic colors. The middle original composition must stay recognizable and undistorted; continue it naturally into all four added areas. Absolutely no balcony rails, furniture, chair, table, cups, kettle, cake stand, logos, new text, frame, vignette, flat color border, or artificial gradient. The expanded photograph will be mapped across a curved 180-degree background, so the full edges must contain real detailed scenery and sky, with adequate buildings and rooftops at the bottom.
```

## Loading and rendering

The route bypasses the site's generic photo preloader in favour of its own
staged walkthrough screen. Texture counts, furniture preparation, lighting, and
shader preparation determine progress; the tour opens after its first complete
frame. Failed loads offer a retry, and cancelled navigation disposes late assets.

Static meshes with compatible materials are batched (`kit.batch`). Immutable
shapes share geometry, leaves use instancing, and the static PCF shadow maps are
drawn once (2048 on desktop, 1024 on mobile). `walkthrough/referenceLighting.ts`
bakes soft ceiling bounce, feature-wall washes and floor contact shadows into
light and AO maps on a second UV set, so the artwork, timber and fabric keep
their own texture scale. Shared room fills replace ceiling and window area
lights; the kitchen retains its under-cabinet area strip.

### Detail, planting and light

- **Detailed pieces:** `walkthrough/details.ts` builds the detailed
  furniture and styling. The sofa has legs, a base rail, deep arms, piped
  cushions and throw pillows. The coffee table and the TV and media console
  have shadow gaps, a soundbar and a status light. The bed has a channel-tufted
  headboard and a knit throw. There are a floating nightstand with a turned
  ceramic lamp, a two-door wardrobe, door levers and hinges, switch plates,
  rug edges, books and lathe-turned ceramics.
- **Plants:** `kit.foliage({ fine: true })` grows thousands of small folded
  leaves per plant. 3D noise clumps them into pom-pom pads, the way
  cloud-pruned bonsai and ficus crowns grow. They come in three tones (shade,
  mid green and sunlit tips), and each plant stays inside an explicit clear
  box, so no leaf passes through furniture.
- **Lattice:** pale birch-coloured timber on a 9-column grid, as on the
  boards.
- **Wallpaper:** the blossom paper carries a cool grey tint toward the boards'
  grey-sage.
- **Downlight scallops:** `referenceLighting.wallLight({ scallops })` bakes
  downlight scallops into the wall light maps: the arched cone where a
  ceiling downlight meets the wall, with irradiance falling off as the cosine
  over distance squared. They cost nothing at runtime. The living room's
  taupe wall has one either side of the blossom panel, under matching ceiling
  fittings.

### Floor reflections

`walkthrough/floorReflection.ts` adds planar reflections to the lacquered
floor. Each frame the room renders, without the leaves, from a camera
mirrored in the floor plane, at 35% resolution, into a mipmapped HDR texture.
The floor blends it in: rippled by its normal map, blurred by its roughness
map, and stronger at grazing angles. The room probe still lights the other
glossy surfaces, and the floor's probe reflection is turned down to 0.2 so it
isn't counted twice.

### Quality tier, resolution and frame rate

The view always renders at one fixed resolution, so walking and resting look
identical. That is never below one pixel per CSS pixel, and up to 1.5 on
high-density screens when the GPU can afford it. Lower resolution while
walking was tried, and read as blur.

On the loading screen, one GPU-synced frame of the full pipeline is timed, and
the result picks the tier for the whole visit:

- **Full pipeline** (frame within about 14 ms, i.e. strong GPUs): HDR
  half-float buffers through `postprocessing`. N8AO ambient occlusion runs at
  half resolution (about 0.5 m deep, "Low" quality). Bloom glows only above
  HDR 1.0, then ACES tone mapping at exposure 1.25. AgX looked grey and
  Neutral looked flat next to the boards. SMAA is merged into the same effect
  pass.
- **Direct** (integrated graphics and phones): the scene renders straight into
  the multisampled canvas, with ACES tone mapping in the material shaders.

`?walkQuality=full` or `?walkQuality=direct` forces a tier. Both tiers keep
the floor reflections, the baked scallops and contact shadows, and a CSS
vignette and film grain, which cost the GPU nothing.

Every material is precompiled on the loading screen for the buffers it really
renders into, so no shader compiles mid-walk. A resize clears the canvas, so
every resize is followed by a render before the browser paints, which
prevents blank-frame blinks.

The canvas's `data-*` attributes report measured render time, draw counts,
resolution, the tier and the timed cost of a full-pipeline frame.

### Measurements

Measured on 2026-10-13 in headless Chrome on Intel UHD Graphics, 1440 × 900,
with GPU timer queries:

| Stage | GPU time per frame |
| --- | --- |
| Scene, direct path, with 4× MSAA | 23–27 ms |
| Scene before the detail pass | 20–25 ms |
| Floor reflection | 2–3 ms |
| N8AO, full tier only | 7–10 ms |
| SMAA, bloom and tone mapping | about 5 ms |

This machine takes the direct tier: a full-pipeline frame times at about
60 ms. Scrolling ran at about 37–38 FPS against 46 before the detail pass,
always at full resolution. These are measurements from one machine, not a
guarantee for every display or GPU.
