import type { NextConfig } from 'next';

const config: NextConfig = {
  /*
   * `pg` usa APIs de Node (sockets, dns) y trae bindings opcionales. Marcarlo
   * como externo evita que el bundler intente empaquetarlo y falle.
   *
   * Nada de esto llega al navegador: las consultas viven en server components y
   * server actions. Si algún día un componente de cliente importa un servicio
   * por error, el build va a fallar acá — que es donde debe fallar.
   */
  serverExternalPackages: ['pg'],
};

export default config;
