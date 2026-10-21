const { z } = require('zod');

// Mensajes de validación en español para toda la API
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case 'invalid_type':
      if (issue.received === 'undefined' || issue.received === 'null') return { message: 'Este campo es obligatorio' };
      if (issue.expected === 'number') return { message: 'Debe ser un número' };
      return { message: 'Tipo de dato inválido' };
    case 'too_small':
      if (issue.type === 'string') return { message: `Mínimo ${issue.minimum} caracteres` };
      if (issue.type === 'number') return { message: `Debe ser mayor o igual a ${issue.minimum}` };
      break;
    case 'too_big':
      if (issue.type === 'string') return { message: `Máximo ${issue.maximum} caracteres` };
      if (issue.type === 'number') return { message: `Debe ser menor o igual a ${issue.maximum}` };
      break;
    case 'invalid_string':
      if (issue.validation === 'email') return { message: 'Correo electrónico inválido' };
      if (issue.validation === 'url') return { message: 'URL inválida' };
      break;
    case 'invalid_enum_value':
      return { message: `Valor no permitido. Opciones: ${issue.options.join(', ')}` };
    default:
  }
  return { message: ctx.defaultError };
});
