/**
 * Lista de colores canónicos reconocidos por el sistema
 */
export const COLOR_CANONICAL_SET = new Set([
  'blanco', 'negro', 'marron', 'azul', 'rojo', 'verde', 'gris', 'rosado', 'amarillo', 'morado', 'vinotinto', 'naranja', 'fucsia', 'beige'
]);

/**
 * Diccionario de Sinónimos y Alias para Tienda Retail (Venezuela)
 */
export const SYNONYMS_MAP = {
  'camisa': 'camisa',
  'camisas': 'camisa',
  'shirt': 'camisa',
  'shirts': 'camisa',
  'tshirt': 'franela',
  't-shirt': 'franela',
  'tshirts': 'franela',
  't-shirts': 'franela',
  'remera': 'franela',
  'remeras': 'franela',
  'playera': 'franela',
  'playeras': 'franela',
  'franela': 'franela',
  'franelas': 'franela',
  
  'pantalon': 'pantalon',
  'pantalones': 'pantalon',
  'jean': 'pantalon',
  'jeans': 'pantalon',
  'denim': 'pantalon',
  'pant': 'pantalon',
  'pants': 'pantalon',
  
  'chaqueta': 'chaqueta',
  'chaquetas': 'chaqueta',
  'sueter': 'chaqueta',
  'suéter': 'chaqueta',
  'hoodie': 'chaqueta',
  'hoodies': 'chaqueta',
  'abrigo': 'chaqueta',
  'abrigos': 'chaqueta',
  'bomber': 'chaqueta',

  'mono': 'mono',
  'monos': 'mono',
  'jogger': 'mono',
  'joggers': 'mono',
  'short': 'short',
  'shorts': 'short',
  'bermuda': 'short',
  'bermudas': 'short',

  // Colores (masculino / femenino / inglés / plural / tonos)
  'blanca': 'blanco', 'blancas': 'blanco', 'blanco': 'blanco', 'blancos': 'blanco', 'white': 'blanco',
  'negra': 'negro', 'negras': 'negro', 'negro': 'negro', 'negros': 'negro', 'black': 'negro',
  'marron': 'marron', 'marrón': 'marron', 'marrones': 'marron', 'brown': 'marron', 'cafe': 'marron', 'café': 'marron',
  'azul': 'azul', 'azules': 'azul', 'blue': 'azul', 'marino': 'azul', 'navy': 'azul', 'celeste': 'azul',
  'roja': 'rojo', 'rojas': 'rojo', 'rojo': 'rojo', 'rojos': 'rojo', 'red': 'rojo',
  'verde': 'verde', 'verdes': 'verde', 'green': 'verde', 'oliva': 'verde', 'olive': 'verde',
  'gris': 'gris', 'grises': 'gris', 'gray': 'gris', 'grey': 'gris', 'plata': 'gris', 'silver': 'gris',
  'rosada': 'rosado', 'rosadas': 'rosado', 'rosado': 'rosado', 'rosados': 'rosado', 'pink': 'rosado', 'rosa': 'rosado',
  'amarilla': 'amarillo', 'amarillas': 'amarillo', 'amarillo': 'amarillo', 'amarillos': 'amarillo', 'yellow': 'amarillo', 'mostaza': 'amarillo',
  'morada': 'morado', 'moradas': 'morado', 'morado': 'morado', 'morados': 'morado', 'purple': 'morado', 'violeta': 'morado',
  'vinotinto': 'vinotinto', 'vino': 'vinotinto', 'burgundy': 'vinotinto',
  'naranja': 'naranja', 'naranjas': 'naranja', 'orange': 'naranja',
  'fucsia': 'fucsia', 'fuchsia': 'fucsia',
  'beige': 'beige', 'crema': 'beige', 'khaki': 'beige', 'caqui': 'beige'
};

/**
 * Normaliza una cadena de texto (remueve tildes, caracteres especiales y convierte a minúsculas)
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
  const stopWords = new Set(['dame', 'todas', 'todos', 'las', 'los', 'les', 'de', 'del', 'el', 'la', 'un', 'una', 'unos', 'unas', 'en', 'con', 'para', 'por', 'o', 'y']);

  const clean = normalizeStr(rawQuery);
  const rawWords = clean.split(/\s+/).filter(w => w.length > 0);

  const tokens = [];
  for (const word of rawWords) {
    if (stopWords.has(word)) continue;
    const canonical = SYNONYMS_MAP[word] || word;
    tokens.push(canonical);
  }

  return tokens;
}

/**
 * Evalúa si un producto (modelo) coincide con TODOS los tokens introducidos por el usuario
 * aplicando estricta disponibilidad de stock > 0 para combinaciones de color y talla
 */
export function matchesAllTokens(item, tokens) {
  if (!tokens || tokens.length === 0) return true;

  const itemNombre = normalizeStr(item.nombre);
  const itemCategoria = normalizeStr(item.categoria);
  const itemCategoriaCanon = SYNONYMS_MAP[itemCategoria] || itemCategoria;
  const itemId = normalizeStr(item.id);

  // Clasificar los tokens de la búsqueda
  const colorTokens = [];
  const sizeTokens = [];
  const generalTokens = [];

  const sizeRegex = /^(xs|s|m|l|xl|xxl|2xl|3xl|4xl|[0-9]{2})$/i;

  for (const token of tokens) {
    if (COLOR_CANONICAL_SET.has(token)) {
      colorTokens.push(token);
    } else if (sizeRegex.test(token)) {
      sizeTokens.push(token);
    } else {
      generalTokens.push(token);
    }
  }

  // 1. Verificar que los generalTokens (nombre, categoría, ID) coincidan
  const matchesGeneral = generalTokens.every(token => {
    return itemCategoria.includes(token) || 
           itemCategoriaCanon.includes(token) || 
           itemNombre.includes(token) || 
           itemId.includes(token);
  });

  if (!matchesGeneral) return false;

  // 2. Si hay colorTokens o sizeTokens, verificar que exista al menos UNA variante DISPONIBLE (stock > 0)
  // que cumpla SIMULTÁNEAMENTE con el color y/o la talla solicitados
  if (colorTokens.length > 0 || sizeTokens.length > 0) {
    let hasMatchingAvailableVariant = false;

    const colorGroups = Array.isArray(item.colores) ? item.colores : [];

    for (const group of colorGroups) {
      const groupColorNorm = normalizeStr(group.color);
      const groupColorCanon = SYNONYMS_MAP[groupColorNorm] || groupColorNorm;

      // ¿Coincide este grupo de color con los colorTokens buscados?
      const colorMatches = colorTokens.length === 0 || colorTokens.some(ct => 
        groupColorNorm.includes(ct) || groupColorCanon.includes(ct)
      );

      if (!colorMatches) continue;

      // Revisar las tallas dentro de este grupo de color
      const tallas = Array.isArray(group.tallas) ? group.tallas : [];
      for (const t of tallas) {
        const tNorm = normalizeStr(t.talla);

        // ¿Coincide esta talla con los sizeTokens buscados?
        const sizeMatches = sizeTokens.length === 0 || sizeTokens.includes(tNorm);

        // ¡CRUCIAL!: Para que la coincidencia sea válida en búsqueda de filtro, DEBE TENER STOCK > 0
        if (sizeMatches && Number(t.stock) > 0) {
          hasMatchingAvailableVariant = true;
          break;
        }
      }

      if (hasMatchingAvailableVariant) break;
    }

    // Si también tiene item.variantes plano (respaldo)
    if (!hasMatchingAvailableVariant && Array.isArray(item.variantes)) {
      for (const v of item.variantes) {
        const vTalla = normalizeStr(v.talla);
        const sizeMatches = sizeTokens.length === 0 || sizeTokens.includes(vTalla);
        
        if (colorTokens.length === 0 && sizeMatches && Number(v.stock) > 0) {
          hasMatchingAvailableVariant = true;
          break;
        }
      }
    }

    if (!hasMatchingAvailableVariant) return false;
  }

  return true;
}

/**
 * Filtra el catálogo completo aplicando la lógica de búsqueda por tokens
 */
export function filterCatalog(catalog, rawQuery) {
  if (!catalog || !Array.isArray(catalog)) return [];
  const tokens = tokenizeQuery(rawQuery);
  if (tokens.length === 0) return catalog;

  return catalog.filter(item => matchesAllTokens(item, tokens));
}
