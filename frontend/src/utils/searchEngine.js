/**
 * Lista de colores y modificadores de tono canónicos reconocidos por el sistema
 */
export const COLOR_CANONICAL_SET = new Set([
  'blanco', 'negro', 'gris', 'azul', 'rojo', 'verde', 'marron',
  'beige', 'crema', 'khaki', 'caramelo', 'terracota', 'mostaza',
  'amarillo', 'naranja', 'rosado', 'morado', 'vinotinto',
  'claro', 'oscuro'
]);

/**
 * Familias estrictas de prendas para evitar contaminación cruzada entre categorías
 */
export const GARMENT_FAMILY_SET = new Set([
  'tshirt', 'camisa', 'sobrecamisa', 'chemise', 'sweater', 'hoodie',
  'chaqueta', 'pantalon', 'jean', 'jogger', 'cargo', 'short',
  'bermuda', 'set', 'zapato', 'gorra', 'gorro', 'chaleco'
]);

/**
 * Diccionario de Sinónimos y Alias para Tienda Retail (Venezuela / FINA ERP)
 * Cada familia de prenda tiene su propio token canónico sin mezclar categorías distintas.
 */
export const SYNONYMS_MAP = {
  // 1. Familia T-SHIRT / FRANELA
  'tshirt': 'tshirt',
  't-shirt': 'tshirt',
  'tshirts': 'tshirt',
  't-shirts': 'tshirt',
  'franela': 'tshirt',
  'franelas': 'tshirt',
  'camiseta': 'tshirt',
  'camisetas': 'tshirt',
  'remera': 'tshirt',
  'remeras': 'tshirt',
  'playera': 'tshirt',
  'playeras': 'tshirt',
  'tee': 'tshirt',
  'tees': 'tshirt',
  'tank': 'tshirt',

  // 2. Familia CAMISA
  'camisa': 'camisa',
  'camisas': 'camisa',
  'shirt': 'camisa',
  'shirts': 'camisa',
  'guayabera': 'camisa',
  'guayaberas': 'camisa',
  'blusa': 'camisa',
  'blusas': 'camisa',

  // 3. Familia SOBRECAMISA
  'sobrecamisa': 'sobrecamisa',
  'sobrecamisas': 'sobrecamisa',
  'overshirt': 'sobrecamisa',

  // 4. Familia CHEMISE / POLO
  'chemise': 'chemise',
  'chemises': 'chemise',
  'chemis': 'chemise',
  'polo': 'chemise',
  'polos': 'chemise',

  // 5. Familia SWEATER / SUÉTER / SUDADERA
  'sweater': 'sweater',
  'sweaters': 'sweater',
  'sueter': 'sweater',
  'sueteres': 'sweater',
  'sudadera': 'sweater',
  'sudaderas': 'sweater',
  'pullover': 'sweater',
  'buzo': 'sweater',
  'buso': 'sweater',

  // 6. Familia HOODIE
  'hoodie': 'hoodie',
  'hoodies': 'hoodie',
  'hoddie': 'hoodie',
  'capucha': 'hoodie',

  // 7. Familia CHAQUETA / JACKET
  'chaqueta': 'chaqueta',
  'chaquetas': 'chaqueta',
  'jacket': 'chaqueta',
  'jackets': 'chaqueta',
  'abrigo': 'chaqueta',
  'abrigos': 'chaqueta',

  // 8. Familia PANTALÓN / PANTS (vestir / casual, separado de jean)
  'pantalon': 'pantalon',
  'pantalones': 'pantalon',
  'pant': 'pantalon',
  'pants': 'pantalon',
  'trouser': 'pantalon',
  'trousers': 'pantalon',
  'chino': 'pantalon',
  'chinos': 'pantalon',

  // 9. Familia JEAN / DENIM
  'jean': 'jean',
  'jeans': 'jean',
  'denim': 'jean',
  'vaquero': 'jean',
  'vaqueros': 'jean',

  // 10. Familia JOGGER / MONO
  'jogger': 'jogger',
  'joggers': 'jogger',
  'mono': 'jogger',
  'monos': 'jogger',

  // 11. Familia CARGO
  'cargo': 'cargo',
  'cargos': 'cargo',

  // 12. Familia SHORT
  'short': 'short',
  'shorts': 'short',

  // 13. Familia BERMUDA / PESCADOR
  'bermuda': 'bermuda',
  'bermudas': 'bermuda',
  'pescador': 'bermuda',
  'pescadores': 'bermuda',

  // 14. Familia SET / CONJUNTO
  'set': 'set',
  'sets': 'set',
  'conjunto': 'set',
  'conjuntos': 'set',
  'outfit': 'set',
  'outfits': 'set',

  // 15. Calzado / Gorras / Gorros / Chalecos
  'zapato': 'zapato',
  'zapatos': 'zapato',
  'calzado': 'zapato',
  'tenis': 'zapato',
  'sneaker': 'zapato',
  'sneakers': 'zapato',
  'gorra': 'gorra',
  'gorras': 'gorra',
  'cap': 'gorra',
  'caps': 'gorra',
  'gorro': 'gorro',
  'gorros': 'gorro',
  'beanie': 'gorro',
  'chaleco': 'chaleco',
  'chalecos': 'chaleco',

  // Correcciones de tipeo de modelos en el ERP
  'glof': 'golf',
  'recto': 'straight',

  // Colores (masculino / femenino / inglés / plural / tonos ERP)
  'blanca': 'blanco', 'blancas': 'blanco', 'blanco': 'blanco', 'blancos': 'blanco', 'white': 'blanco',
  'negra': 'negro', 'negras': 'negro', 'negro': 'negro', 'negros': 'negro', 'black': 'negro',
  'gris': 'gris', 'grises': 'gris', 'gray': 'gris', 'grey': 'gris', 'plata': 'gris', 'silver': 'gris', 'girs': 'gris',
  'azul': 'azul', 'azules': 'azul', 'blue': 'azul', 'marino': 'azul', 'navy': 'azul', 'celeste': 'azul',
  'roja': 'rojo', 'rojas': 'rojo', 'rojo': 'rojo', 'rojos': 'rojo', 'red': 'rojo',
  'verde': 'verde', 'verdes': 'verde', 'green': 'verde', 'oliva': 'verde', 'olive': 'verde',
  'marron': 'marron', 'marrones': 'marron', 'brown': 'marron', 'cafe': 'marron', 'chocolate': 'marron', 'tabaco': 'marron',
  'beige': 'beige', 'beig': 'beige',
  'crema': 'crema', 'cream': 'crema', 'marfil': 'crema', 'hueso': 'crema',
  'khaki': 'khaki', 'caqui': 'khaki', 'kaki': 'khaki',
  'caramel': 'caramelo', 'caramelo': 'caramelo', 'camel': 'caramelo',
  'terracota': 'terracota', 'ladrillo': 'terracota',
  'mostaza': 'mostaza', 'mustard': 'mostaza',
  'amarilla': 'amarillo', 'amarillas': 'amarillo', 'amarillo': 'amarillo', 'amarillos': 'amarillo', 'yellow': 'amarillo', 'dorado': 'amarillo',
  'naranja': 'naranja', 'naranjas': 'naranja', 'orange': 'naranja', 'coral': 'naranja',
  'rosada': 'rosado', 'rosadas': 'rosado', 'rosado': 'rosado', 'rosados': 'rosado', 'pink': 'rosado', 'rosa': 'rosado', 'fucsia': 'rosado', 'fuchsia': 'rosado',
  'morada': 'morado', 'moradas': 'morado', 'morado': 'morado', 'morados': 'morado', 'purple': 'morado', 'violeta': 'morado', 'lila': 'morado',
  'vinotinto': 'vinotinto', 'vino': 'vinotinto', 'burgundy': 'vinotinto', 'burdeos': 'vinotinto',
  'clara': 'claro', 'claro': 'claro', 'claros': 'claro', 'claras': 'claro', 'light': 'claro',
  'oscura': 'oscuro', 'oscuro': 'oscuro', 'oscuros': 'oscuro', 'oscuras': 'oscuro', 'dark': 'oscuro'
};

/**
 * Normaliza una cadena de texto (remueve tildes y convierte a minúsculas)
 */
export function normalizeStr(str) {
  if (!str) return '';
  return str
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Divide el texto de búsqueda en tokens (palabras clave) y traduce sinónimos
 */
export function tokenizeQuery(rawQuery) {
  if (!rawQuery) return [];
  const stopWords = new Set([
    'dame', 'todas', 'todos', 'las', 'los', 'les', 'de', 'del',
    'el', 'la', 'un', 'una', 'unos', 'unas', 'en', 'con', 'para',
    'por', 'o', 'y', 'talla', 'color'
  ]);

  const clean = normalizeStr(rawQuery);
  const rawWords = clean.split(/\s+/).filter(w => w.length > 0);

  const tokens = [];
  for (const word of rawWords) {
    if (stopWords.has(word)) continue;
    const canonical = SYNONYMS_MAP[word] || word;
    if (!tokens.includes(canonical)) {
      tokens.push(canonical);
    }
  }

  return tokens;
}

/**
 * Determina a qué familias estrictas de prenda pertenece un producto del catálogo
 * según su categoría ERP y las palabras exactas de su nombre.
 */
export function getItemFamilies(item) {
  const families = new Set();
  const cat = normalizeStr(item.categoria);
  const name = normalizeStr(item.nombre);

  const spaceWords = name.split(/\s+/).filter(Boolean);
  const allWords = name.split(/[\s\-_\/,()+]+/).filter(Boolean);

  // 1. Por Categoría oficial en FINA ERP
  if (cat === 't-shirt' || cat === 'tshirt' || cat === 'franela') families.add('tshirt');
  else if (cat === 'camisa') families.add('camisa');
  else if (cat === 'chemise') families.add('chemise');
  else if (cat === 'sweater') families.add('sweater');
  else if (cat === 'hoodie') families.add('hoodie');
  else if (cat === 'chaqueta') families.add('chaqueta');
  else if (cat === 'pantalon' || cat === 'pants') families.add('pantalon');
  else if (cat === 'jean' || cat === 'jean recto') families.add('jean');
  else if (cat === 'jogger cargo') {
    families.add('jogger');
    families.add('cargo');
  }
  else if (cat === 'short') families.add('short');
  else if (cat === 'bermuda') families.add('bermuda');
  else if (cat === 'set') families.add('set');

  // 2. Por palabra exacta en el nombre del producto (soporta categoría OC y piezas individuales de SET)
  if (
    spaceWords.includes('t-shirt') ||
    spaceWords.includes('t-shirts') ||
    allWords.includes('tshirt') ||
    allWords.includes('tshirts') ||
    allWords.includes('franela') ||
    allWords.includes('franelas') ||
    allWords.includes('tank')
  ) {
    families.add('tshirt');
  }
  if (allWords.includes('camisa') || allWords.includes('camisas')) {
    families.add('camisa');
  }
  if (allWords.includes('sobrecamisa') || allWords.includes('sobrecamisas')) {
    families.add('sobrecamisa');
  }
  if (
    allWords.includes('chemise') ||
    allWords.includes('chemises') ||
    allWords.includes('polo') ||
    allWords.includes('polos')
  ) {
    families.add('chemise');
  }
  if (
    allWords.includes('sweater') ||
    allWords.includes('sweaters') ||
    allWords.includes('sueter') ||
    allWords.includes('sueteres') ||
    allWords.includes('sudadera') ||
    allWords.includes('sudaderas')
  ) {
    families.add('sweater');
  }
  if (allWords.includes('hoodie') || allWords.includes('hoodies')) {
    families.add('hoodie');
  }
  if (
    allWords.includes('chaqueta') ||
    allWords.includes('chaquetas') ||
    allWords.includes('jacket') ||
    allWords.includes('jackets') ||
    allWords.includes('bomber') ||
    allWords.includes('varsity')
  ) {
    families.add('chaqueta');
  }
  if (
    allWords.includes('pantalon') ||
    allWords.includes('pantalones') ||
    allWords.includes('pants') ||
    allWords.includes('pant')
  ) {
    families.add('pantalon');
  }
  if (
    (allWords.includes('jean') || allWords.includes('jeans') || allWords.includes('denim')) &&
    !families.has('chaqueta')
  ) {
    families.add('jean');
  }
  if (allWords.includes('jogger') || allWords.includes('joggers')) {
    families.add('jogger');
  }
  if (allWords.includes('cargo') || allWords.includes('cargos')) {
    families.add('cargo');
  }
  if (allWords.includes('short') || allWords.includes('shorts')) {
    families.add('short');
  }
  if (
    allWords.includes('bermuda') ||
    allWords.includes('bermudas') ||
    allWords.includes('pescador') ||
    allWords.includes('pescadores')
  ) {
    families.add('bermuda');
  }
  if (
    allWords.includes('set') ||
    allWords.includes('sets') ||
    allWords.includes('conjunto') ||
    allWords.includes('conjuntos')
  ) {
    families.add('set');
  }
  if (allWords.includes('zapato') || allWords.includes('zapatos')) families.add('zapato');
  if (allWords.includes('gorra') || allWords.includes('gorras')) families.add('gorra');
  if (allWords.includes('gorro') || allWords.includes('gorros')) families.add('gorro');
  if (allWords.includes('chaleco') || allWords.includes('chalecos')) families.add('chaleco');

  return families;
}

/**
 * Obtiene el conjunto de colores canónicos de un grupo de color del ERP.
 * Si el grupo tiene un color genérico ("TALLA", "GENERAL", "OC BERMUDAS"),
 * infiere el color a partir del nombre del producto (ej. "jean black" -> "negro").
 */
export function getGroupCanonicalColors(item, group) {
  const colorSet = new Set();
  const rawGroupColor = normalizeStr(group?.color || '');

  // Casos abreviados en ERP: GRIS-C (Gris Claro) y GRIS-O (Gris Oscuro)
  if (rawGroupColor === 'gris-c') {
    colorSet.add('gris');
    colorSet.add('claro');
  } else if (rawGroupColor === 'gris-o') {
    colorSet.add('gris');
    colorSet.add('oscuro');
  }

  const groupWords = rawGroupColor.split(/[\s\/\-_]+/).filter(Boolean);
  for (const w of groupWords) {
    const canon = SYNONYMS_MAP[w] || w;
    if (COLOR_CANONICAL_SET.has(canon)) {
      colorSet.add(canon);
    }
  }

  // Si la casilla de color en el ERP es genérica ("TALLA", "GENERAL", etc.), extraer color del nombre del modelo
  if (colorSet.size === 0 && item?.nombre) {
    const nameWords = normalizeStr(item.nombre).split(/[\s\/\-_]+/).filter(Boolean);
    for (const w of nameWords) {
      const canon = SYNONYMS_MAP[w] || w;
      if (COLOR_CANONICAL_SET.has(canon)) {
        colorSet.add(canon);
      }
    }
  }

  return colorSet;
}

/**
 * Verifica si un grupo de color cumple con los tokens de color buscados
 */
export function doesColorGroupMatch(item, group, colorTokens) {
  if (!colorTokens || colorTokens.length === 0) return true;
  const groupColors = getGroupCanonicalColors(item, group);
  if (groupColors.size === 0) return false;
  return colorTokens.every(ct => groupColors.has(ct));
}

/**
 * Evalúa si un producto (modelo) coincide con TODOS los tokens introducidos por el usuario
 * aplicando separación estricta por familias y disponibilidad de stock > 0 para color/talla.
 */
export function matchesAllTokens(item, tokens) {
  if (!tokens || tokens.length === 0) return true;

  const itemNombre = normalizeStr(item.nombre);
  const itemCategoria = normalizeStr(item.categoria);
  const itemId = normalizeStr(item.id);
  const itemFamilies = getItemFamilies(item);

  // Palabras individuales del nombre y categoría (con traducción de sinónimos de modelo como glof -> golf, recto -> straight)
  const rawItemWords = `${itemNombre} ${itemCategoria}`
    .split(/[\s\-_\/,()+]+/)
    .filter(Boolean);
  const normalizedItemWords = rawItemWords.map(w => SYNONYMS_MAP[w] || w);

  const colorTokens = [];
  const sizeTokens = [];
  const familyTokens = [];
  const generalTokens = [];

  const sizeRegex = /^(xs|s|m|l|xl|xxl|2xl|3xl|4xl|unica|[0-9]{2})$/i;

  for (const token of tokens) {
    if (COLOR_CANONICAL_SET.has(token)) {
      colorTokens.push(token);
    } else if (sizeRegex.test(token)) {
      sizeTokens.push(token);
    } else if (GARMENT_FAMILY_SET.has(token)) {
      familyTokens.push(token);
    } else {
      generalTokens.push(token);
    }
  }

  // 1. Verificar coincidencia estricta de familia de prenda (si el usuario especificó tipo de prenda)
  for (const fToken of familyTokens) {
    if (itemFamilies.has(fToken)) continue;
    // Caso especial: "chaqueta jean" -> permite que "oc chaquetas jean" coincida cuando se buscan ambos tokens
    if (fToken === 'jean' && familyTokens.includes('chaqueta') && rawItemWords.includes('jean')) {
      continue;
    }
    return false;
  }

  // 2. Verificar tokens generales (nombre de modelo, colección, código o SKU)
  const matchesGeneral = generalTokens.every(token => {
    // Coincidencia por palabra o prefijo de palabra en nombre/categoría (sin cruzar subcadenas falsas)
    const wordMatch = rawItemWords.some(w => w === token || w.startsWith(token) || (token.length >= 4 && w.includes(token))) ||
                      normalizedItemWords.some(w => w === token || w.startsWith(token) || (token.length >= 4 && w.includes(token)));
    if (wordMatch) return true;

    // Coincidencia por SKU de variante
    if (Array.isArray(item.variantes)) {
      const skuMatch = item.variantes.some(v => v.sku && normalizeStr(v.sku).includes(token));
      if (skuMatch) return true;
    }

    // Coincidencia por ID del modelo (solo si el token tiene números o >= 6 caracteres para no chocar con hex)
    if ((/\d/.test(token) || token.length >= 6) && itemId.includes(token)) {
      return true;
    }

    return false;
  });

  if (!matchesGeneral) return false;

  // 3. Si hay colorTokens o sizeTokens, verificar que exista al menos UNA variante DISPONIBLE (stock > 0)
  // que cumpla SIMULTÁNEAMENTE con el color y la talla solicitados
  if (colorTokens.length > 0 || sizeTokens.length > 0) {
    let hasMatchingAvailableVariant = false;
    const colorGroups = Array.isArray(item.colores) ? item.colores : [];

    for (const group of colorGroups) {
      if (!doesColorGroupMatch(item, group, colorTokens)) continue;

      const tallas = Array.isArray(group.tallas) ? group.tallas : [];
      for (const t of tallas) {
        const tNorm = normalizeStr(t.talla);
        const sizeMatches = sizeTokens.length === 0 || sizeTokens.includes(tNorm);

        if (sizeMatches && Number(t.stock) > 0) {
          hasMatchingAvailableVariant = true;
          break;
        }
      }

      if (hasMatchingAvailableVariant) break;
    }

    // Respaldo para variantes planas sin grupos de color
    if (!hasMatchingAvailableVariant && colorGroups.length === 0 && Array.isArray(item.variantes)) {
      const fallbackGroupMatch = doesColorGroupMatch(item, { color: '' }, colorTokens);
      if (fallbackGroupMatch) {
        for (const v of item.variantes) {
          const vTalla = normalizeStr(v.talla);
          const sizeMatches = sizeTokens.length === 0 || sizeTokens.includes(vTalla);
          if (sizeMatches && Number(v.stock) > 0) {
            hasMatchingAvailableVariant = true;
            break;
          }
        }
      }
    }

    if (!hasMatchingAvailableVariant) return false;
  }

  return true;
}

/**
 * Filtra el catálogo completo aplicando la lógica de búsqueda avanzada por tokens
 */
export function filterCatalog(catalog, rawQuery) {
  if (!catalog || !Array.isArray(catalog)) return [];
  const tokens = tokenizeQuery(rawQuery);
  if (tokens.length === 0) return catalog;

  return catalog.filter(item => matchesAllTokens(item, tokens));
}
