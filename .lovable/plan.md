

## Fix: Error al agregar admin

### Problema
La funcion `invite-admin` no esta registrada en `supabase/config.toml` con `verify_jwt = false`. Esto hace que la funcion rechace las llamadas porque la verificacion JWT por defecto falla antes de que el codigo pueda validar al usuario manualmente.

### Solucion

**1. Agregar `invite-admin` a `supabase/config.toml`**

Agregar la entrada:
```toml
[functions.invite-admin]
  verify_jwt = false
```

Esto permite que la funcion reciba la llamada y valide la autorizacion internamente (como ya lo hace en el codigo, verificando que el caller sea `super_admin`).

### Detalle tecnico
- La funcion ya tiene su propia validacion de autorizacion: verifica el header `Authorization`, obtiene el usuario, y confirma que sea `super_admin` antes de proceder
- Solo falta la configuracion en `config.toml` para que la plataforma permita que la request llegue a la funcion

