export type InteriorStoryFrame = {
  key: string
  src: string
  title: string
  note: string
  alt: string
  kind?: 'plan'
  position?: string
  mobilePosition?: string
}

export type InteriorImageProject = {
  key: string
  title: string
  eyebrow: string
  facts: string
  frames: InteriorStoryFrame[]
}

const DIR = '/tours/image-stories'

// Individual panels from the architect's boards in tour-source/. Render
// panels fill the screen; floor plans retain their entire composition.
export const INTERIOR_IMAGE_STORIES: InteriorImageProject[] = [
  {
    key: 'saint-honore-5b',
    title: 'Saint Honore Unit 5B',
    eyebrow: 'Interior design · Condominium',
    facts: 'Studio unit · 24 sqm + 3 sqm balcony',
    frames: [
      {
        key: 'bedroom',
        src: `${DIR}/saint-honore-5b-bedroom.webp`,
        title: 'Sleeping area',
        note: 'An illuminated arch, botanical walls and warm, layered light.',
        alt: 'Saint Honore Unit 5B bedroom design with a green arched headboard, botanical wallpaper and woven pendant lights.',
        position: '50% 42%',
        mobilePosition: '52% 50%',
      },
      {
        key: 'dining',
        src: `${DIR}/saint-honore-5b-dining.webp`,
        title: 'Dining',
        note: 'A dining corner framed by green accents and soft light.',
        alt: 'Saint Honore Unit 5B dining design with a table, green wall panels, warm accent lighting and indoor plants.',
        position: '50% 45%',
        mobilePosition: '50% 50%',
      },
      {
        key: 'living',
        src: `${DIR}/saint-honore-5b-living.webp`,
        title: 'Living room',
        note: 'A clean media wall, softened by botanical details.',
        alt: 'Saint Honore Unit 5B living area design showing an illuminated television wall, green accents and botanical wallpaper.',
        position: '50% 45%',
        mobilePosition: '54% 50%',
      },
      {
        key: 'kitchen',
        src: `${DIR}/saint-honore-5b-kitchen.webp`,
        title: 'Kitchen',
        note: 'Green cabinetry and warm finishes in a compact, considered layout.',
        alt: 'Saint Honore Unit 5B kitchen design with green cabinetry, a warm stone-look backsplash and a refrigerator.',
        position: '50% 50%',
        mobilePosition: '55% 50%',
      },
    ],
  },
  {
    key: 'casa-john',
    title: 'Casa John',
    eyebrow: 'Architecture · House design',
    facts: '150 sqm lot · 131 sqm floor area',
    frames: [
      {
        key: 'front',
        src: `${DIR}/casa-john-front.webp`,
        title: 'Front elevation',
        note: 'A pitched silhouette with timber tones and crisp white framing.',
        alt: 'Casa John architectural front elevation with a pitched roof, large upper window, timber-toned cladding and landscaped frontage.',
        position: '50% 48%',
        mobilePosition: '46% 50%',
      },
      {
        key: 'angle',
        src: `${DIR}/casa-john-angle.webp`,
        title: 'A different angle',
        note: 'Contrasting materials bring depth to the facade.',
        alt: 'Casa John exterior viewed at an angle, showing white roof framing, timber-toned panels, dark walls and planting.',
        position: '50% 42%',
        mobilePosition: '48% 50%',
      },
      {
        key: 'detail',
        src: `${DIR}/casa-john-detail.webp`,
        title: 'The signature window',
        note: 'A warm frame follows the roofline and draws in daylight.',
        alt: 'Detail of Casa John’s large gabled window with a warm timber-toned surround, white trim and dark cladding.',
        position: '50% 40%',
        mobilePosition: '50% 50%',
      },
      {
        key: 'plan',
        src: `${DIR}/casa-john-plan.webp`,
        title: 'The floor plans',
        note: 'Shared spaces and bedrooms, arranged across two floors.',
        alt: 'Casa John ground-floor and second-floor plans showing the living and dining spaces, kitchen, bedrooms, bathrooms, stairs, carport and balcony.',
        kind: 'plan',
      },
    ],
  },
  {
    key: 'casa-matthew',
    title: 'Casa Matthew',
    eyebrow: 'Architecture · House design',
    facts: '150 sqm lot · 156 sqm floor area',
    frames: [
      {
        key: 'front',
        src: `${DIR}/casa-matthew-front.webp`,
        title: 'Front elevation',
        note: 'Layered rooflines, vertical screens and a green edge.',
        alt: 'Casa Matthew architectural front elevation with layered flat rooflines, vertical screens, a planted balcony and a front gate.',
        position: '50% 48%',
        mobilePosition: '50% 50%',
      },
      {
        key: 'angle',
        src: `${DIR}/casa-matthew-angle.webp`,
        title: 'Layers of shade',
        note: 'Deep overhangs and planting soften the exterior.',
        alt: 'Casa Matthew exterior viewed at an angle, showing broad roof overhangs, timber-toned soffits, a planted balcony and facade screening.',
        position: '50% 43%',
        mobilePosition: '52% 50%',
      },
      {
        key: 'detail',
        src: `${DIR}/casa-matthew-detail.webp`,
        title: 'Warmth in the details',
        note: 'Timber tones and vertical lines frame the entrance.',
        alt: 'Close view of Casa Matthew’s entrance facade with vertical screening, textured pale walls and a timber-toned roof soffit.',
        position: '50% 42%',
        mobilePosition: '50% 50%',
      },
      {
        key: 'plan',
        src: `${DIR}/casa-matthew-plan.webp`,
        title: 'The floor plans',
        note: 'A closer look at how the home comes together.',
        alt: 'Casa Matthew ground-floor and second-floor architectural plans.',
        kind: 'plan',
      },
    ],
  },
]
