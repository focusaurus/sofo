/**
 * A JSON Schema validator covering exactly the keywords schema/sf-1.schema.json
 * uses — and failing loudly on any it does not know.
 *
 * The alternative was a dependency, and this repo has none: it runs from a static
 * file server and a plain `node tools/*.js`. The trade is that extending the
 * schema with a new keyword means teaching it here, which the UNSUPPORTED error
 * makes impossible to forget.
 */

const KNOWN = new Set([
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "title",
  "description",
  "examples",
  "format", // annotation only: we do not check date-time
  "sofoSchemaVersion",
  "sofoSchemaDate",
  "type",
  "const",
  "enum",
  "oneOf",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "minLength",
  "pattern",
  "minimum",
  "exclusiveMinimum",
]);

const typeOf = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
};

const matchesType = (value, type) => {
  const actual = typeOf(value);
  if (type === "number") return actual === "number" || actual === "integer";
  return actual === type;
};

/** Resolve a local "#/$defs/bar" pointer against the root schema. */
function deref(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`UNSUPPORTED $ref: ${ref}`);
  return ref
    .slice(2)
    .split("/")
    .reduce((node, key) => {
      if (node?.[key] === undefined) throw new Error(`unresolvable $ref: ${ref}`);
      return node[key];
    }, root);
}

/**
 * Validate `value` against `schema`. Returns an array of "path: problem"
 * strings — empty means valid.
 */
export function validate(schema, value, { root = schema, path = "" } = {}) {
  for (const keyword of Object.keys(schema)) {
    if (!KNOWN.has(keyword)) throw new Error(`UNSUPPORTED keyword: ${keyword}`);
  }
  const at = (key) => (path ? `${path}.${key}` : String(key));
  const errors = [];
  const fail = (problem) => errors.push(`${path || "<root>"}: ${problem}`);

  if (schema.$ref) return validate(deref(root, schema.$ref), value, { root, path });

  if (schema.type && !matchesType(value, schema.type)) {
    return [`${path || "<root>"}: expected ${schema.type}, got ${typeOf(value)}`];
  }
  if ("const" in schema && value !== schema.const) {
    fail(`expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    fail(`${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }
  if (schema.oneOf) {
    const passing = schema.oneOf.filter(
      (option) => validate(option, value, { root, path }).length === 0,
    );
    if (passing.length !== 1) {
      fail(`${JSON.stringify(value)} matches ${passing.length} of ${schema.oneOf.length} oneOf`);
    }
  }
  if (schema.pattern && typeof value === "string" && !new RegExp(schema.pattern).test(value)) {
    fail(`${JSON.stringify(value)} does not match /${schema.pattern}/`);
  }
  if (schema.minLength != null && typeof value === "string" && value.length < schema.minLength) {
    fail(`shorter than ${schema.minLength}`);
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) fail(`below minimum ${schema.minimum}`);
    if (schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum) {
      fail(`not above ${schema.exclusiveMinimum}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) {
      fail(`needs at least ${schema.minItems} item(s), has ${value.length}`);
    }
    if (schema.items) {
      value.forEach((item, i) => {
        errors.push(...validate(schema.items, item, { root, path: at(i) }));
      });
    }
  }
  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) {
      if (!(key in value)) fail(`missing required "${key}"`);
    }
    for (const [key, child] of Object.entries(value)) {
      const subschema = schema.properties?.[key];
      if (subschema) {
        errors.push(...validate(subschema, child, { root, path: at(key) }));
      } else if (schema.properties && schema.additionalProperties === false) {
        fail(`unknown property "${key}"`);
      }
    }
  }
  return errors;
}
