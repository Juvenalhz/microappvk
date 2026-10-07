/**
 * Diccionario de Sinónimos y Alias para Tienda Retail (Venezuela)
 */
export const SYNONYMS_MAP = {
  // Categorías
  'tshirt': 'franela',
  't-shirt': 'franela',
  'tshirts': 'franela',
  't-shirts': 'franela',
  'remera': 'franela',
  'remeras': 'franela',
  'playera': 'franela',
  'playeras': 'franela',
  'camisa': 'franela',
  'camisas': 'franela',
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
    .replace(/[\u0300-\u036f]/g,)
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
 */
export function matchesAllTokens(item, tokens) {
  if (!tokens || tokens.length === 0) return true;

  const itemNombre = normalizeStr(item.nombre);
  const itemCategoria = normalizeStr(item.categoria);
  const itemCategoriaCanon = SYNONYMS_MAP[itemCategoria] || itemCategoria;
  const itemId = normalizeStr(item.id);

  // Extraer todos los colores del producto normalizados
  const itemColores = [];
  if (Array.isArray(item.colores)) {
    for (const c of item.colores) {
      const cNorm = normalizeStr(c.color);
      itemColores.push(cNorm);
      if (SYNONYMS_MAP[cNorm]) itemColores.push(SYNONYMS_MAP[cNorm]);
    }
  }

  // Extraer todas las tallas del producto normalizadas
  const itemTallas = new Set();
  if (Array.isArray(item.colores)) {
    for (const c of item.colores) {
      if (Array.isArray(c.tallas)) {
        for (const t of c.tallas) {
          itemTallas.add(normalizeStr(t.talla));
        }
      }
    }
  } else if (Array.isArray(item.variantes)) {
    for (const v of item.variantes) {
      itemTallas.add(normalizeStr(v.talla));
    }
  }

  // Verificar que CADA token coincida al menos con algún atributo del producto
  return tokens.every(token => {
    if (itemCategoria.includes(token) || itemCategoriaCanon.includes(token)) return true;
    if (itemNombre.includes(token) || itemId.includes(token)) return true;
    if (itemColores.some(c => c.includes(token))) return true;
    if (itemTallas.has(token)) return true;
    return false;
  });
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
