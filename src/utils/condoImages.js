const STORAGE_URL = 'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/condo-images/'

export function getCondoImages(condoCode) {
  if (!condoCode) return []
  return [
    `${STORAGE_URL}${condoCode}_1.jpg`,
    `${STORAGE_URL}${condoCode}_2.jpg`,
    `${STORAGE_URL}${condoCode}_3.jpg`,
    `${STORAGE_URL}${condoCode}_4.jpg`,
    `${STORAGE_URL}${condoCode}_5.jpg`
  ]
}

export function getCondoImage(condo) {
  if (!condo) return null
  if (condo.images?.[0]) return condo.images[0]
  if (condo.code) return `${STORAGE_URL}${condo.code}_1.jpg`
  return null
}