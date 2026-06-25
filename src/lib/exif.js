// ============================================================
// exif.js — Extract EXIF metadata from a photo file, reverse-geocode
//   GPS coordinates, and turn metadata into searchable tags.
// ============================================================

import exifr from 'exifr'

export async function extractExif(file) {
  try {
    const exif = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      interop: true,
      ifd1: false,
      mergeOutput: true,
      sanitize: true,
      reviveValues: true,
    })
    if (!exif) return null

    // Format aperture: 1.8 → "f/1.8"
    const aperture = exif.FNumber
      ? `f/${exif.FNumber % 1 === 0 ? exif.FNumber : exif.FNumber.toFixed(1)}`
      : null

    // Format shutter speed: 0.002 → "1/500s"
    const shutterSpeed = exif.ExposureTime
      ? exif.ExposureTime < 1
        ? `1/${Math.round(1 / exif.ExposureTime)}s`
        : `${exif.ExposureTime}s`
      : null

    // Format focal length: 85.0 → "85mm"
    const focalLength = exif.FocalLength ? `${Math.round(exif.FocalLength)}mm` : null

    // Flash
    const flash =
      exif.Flash !== undefined
        ? exif.Flash === 0 || exif.Flash === 16
          ? 'No Flash'
          : 'Flash'
        : null

    // GPS
    const gpsLat = exif.latitude || null
    const gpsLng = exif.longitude || null

    return {
      cameraMake: exif.Make?.trim() || null,
      cameraModel: exif.Model?.trim() || null,
      lensModel: exif.LensModel?.trim() || null,
      aperture,
      shutterSpeed,
      iso: exif.ISO || null,
      focalLength,
      flash,
      exposureMode: exif.ExposureModeString || null,
      gpsLat,
      gpsLng,
      takenAt: exif.DateTimeOriginal || exif.DateTime || null,
    }
  } catch (e) {
    console.warn('[exif] parse error:', e.message)
    return null
  }
}

// Reverse geocode GPS → place name via OpenStreetMap Nominatim (free, no key).
export async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PhotoCatalog/1.0' },
    })
    if (!res.ok) return null
    const data = await res.json()
    const addr = data.address || {}
    const city = addr.city || addr.town || addr.village || addr.county || addr.state
    const country = addr.country
    if (city && country) return `${city}, ${country}`
    if (country) return country
    return null
  } catch {
    return null
  }
}

// Build searchable tags from EXIF metadata + resolved GPS location.
export function exifToTags(exifData, gpsLocation) {
  const tags = []

  if (exifData.cameraMake) {
    tags.push(exifData.cameraMake.toLowerCase())
  }
  if (exifData.cameraModel) {
    tags.push(exifData.cameraModel.toLowerCase())
    // Also a short model without the make: "canon eos r5" → "eos r5"
    if (exifData.cameraMake) {
      const shortModel = exifData.cameraModel
        .toLowerCase()
        .replace(exifData.cameraMake.toLowerCase(), '')
        .trim()
      if (shortModel && shortModel !== exifData.cameraModel.toLowerCase()) {
        tags.push(shortModel)
      }
    }
  }

  if (exifData.focalLength) tags.push(exifData.focalLength)
  if (exifData.aperture) tags.push(exifData.aperture)
  if (exifData.iso) tags.push(`iso ${exifData.iso}`)

  if (gpsLocation) {
    tags.push(gpsLocation.toLowerCase())
    gpsLocation.split(',').forEach((part) => {
      const t = part.trim().toLowerCase()
      if (t && !tags.includes(t)) tags.push(t)
    })
  }

  return [...new Set(tags)].filter(Boolean)
}
