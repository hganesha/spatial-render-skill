// Dependency-free evaluator for the JSON Schema vocabulary used by scene.schema.json.
// Both the CLI and the offline browser runtime consume the generated SCENE_SCHEMA.
export function validateSchema(schema, value) {
  function visit(rule, data, path) {
    const errors = [];
    const error = message => errors.push({level:'error',code:'schema:invalid',message:`${path || '/'} ${message}`,context:path || '/'});
    if (rule.$ref) {
      const target = rule.$ref.split('/').slice(1).reduce((node,key) => node[key.replace(/~1/g,'/').replace(/~0/g,'~')], schema);
      return visit(target, data, path);
    }
    if (rule.type) {
      const valid = rule.type === 'object' ? data !== null && typeof data === 'object' && !Array.isArray(data)
        : rule.type === 'array' ? Array.isArray(data)
        : rule.type === 'integer' ? Number.isInteger(data)
        : rule.type === 'number' ? typeof data === 'number' && Number.isFinite(data)
        : typeof data === rule.type;
      if (!valid) { error(`must be ${rule.type}.`); return errors; }
    }
    if (rule.enum && !rule.enum.some(item => JSON.stringify(item) === JSON.stringify(data))) error(`must be one of ${rule.enum.join(', ')}.`);
    if (typeof data === 'number') {
      if (!Number.isFinite(data)) error('must be finite.');
      if (rule.minimum !== undefined && data < rule.minimum) error(`must be >= ${rule.minimum}.`);
      if (rule.maximum !== undefined && data > rule.maximum) error(`must be <= ${rule.maximum}.`);
      if (rule.exclusiveMinimum !== undefined && data <= rule.exclusiveMinimum) error(`must be > ${rule.exclusiveMinimum}.`);
      if (rule.exclusiveMaximum !== undefined && data >= rule.exclusiveMaximum) error(`must be < ${rule.exclusiveMaximum}.`);
    }
    if (typeof data === 'string' && rule.pattern && !new RegExp(rule.pattern).test(data)) error(`must match ${rule.pattern}.`);
    if (Array.isArray(data)) {
      if (rule.minItems !== undefined && data.length < rule.minItems) error(`needs at least ${rule.minItems} items.`);
      if (rule.maxItems !== undefined && data.length > rule.maxItems) error(`allows at most ${rule.maxItems} items.`);
      if (rule.items) data.forEach((item,index) => errors.push(...visit(rule.items,item,`${path}/${index}`)));
    }
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      for (const key of rule.required || []) if (!Object.hasOwn(data,key)) error(`requires ${key}.`);
      for (const [key,item] of Object.entries(data)) {
        const childPath = `${path}/${key.replace(/~/g,'~0').replace(/\//g,'~1')}`;
        if (rule.properties?.[key]) errors.push(...visit(rule.properties[key],item,childPath));
        else if (rule.additionalProperties === false) error(`does not allow property ${key}.`);
        else if (rule.additionalProperties && typeof rule.additionalProperties === 'object') errors.push(...visit(rule.additionalProperties,item,childPath));
      }
    }
    if (rule.oneOf) {
      const alternatives = rule.oneOf.map(branch => visit(branch,data,path));
      const valid = alternatives.filter(list => list.length === 0).length;
      if (valid !== 1) {
        // A discriminated geometry branch gives much clearer errors than all recipe enums.
        const branch = rule.oneOf.findIndex(candidate => candidate.properties?.kind?.enum?.includes(data?.kind));
        if (branch >= 0 && alternatives[branch].length) errors.push(...alternatives[branch]);
        else error(valid > 1 ? 'matches more than one schema alternative.' : 'does not match a supported schema alternative.');
      }
    }
    return errors;
  }
  return visit(schema,value,'');
}
