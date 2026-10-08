ESTUDIO QR — Experiencia cinematográfica por scroll (7 escenas) + Panel de edición
====================================================================================

INICIAR (solo necesita Python 3; el motor ya no depende de GSAP / Three.js / Lenis)
  Windows: doble clic en iniciar.bat      Mac/Linux: ./iniciar.sh
  Se abre el panel:  http://localhost:8000/admin.html
  La web:            http://localhost:8000/
  Contraseña del panel: está en admin-password.txt (cambiala antes de publicar).

QUÉ HAY DE NUEVO
  • 7 fondos nuevos renderizados en 3D con el estilo del cubo QR original (assets/fotos/fondo_0X_*.jpg, 2400×1350).
  • 4 videos de prueba en el mismo estilo (assets/video/*.mp4). Están codificados con keyframes cada 0,5 s,
    así que funcionan en modo «atado al scroll».
  • Motor nuevo (app.js + qr-model.js): todo es una línea de tiempo; el scroll, la reproducción automática
    o el panel solo mueven el cursor.

EL PANEL
  Arriba: deshacer/rehacer, estado, Revisión (avisos antes de publicar), Guardar.
  Izquierda: escenas (arrastrá para reordenar; menú ⋯: duplicar, copiar/pegar ajustes, aplicar a todas).
  Centro: el inspector de la escena, por secciones:
    Contenido ....... textos, posición del texto (9 posiciones), animación de letras, velo de contraste.
    Fondo y cámara .. imagen/video, ajuste, video en bucle / atado al scroll / una vez.
                      CÁMARA CON KEYFRAMES: cada keyframe es un encuadre (zoom 1×–8×, punto focal, rotación
                      y curva). Se edita arrastrando el recuadro sobre la imagen, con la rueda del mouse,
                      o Alt+clic para centrar en un punto.
    Tiempo .......... largo de la escena y sus 4 fases; pistas de tiempo de título, textos y 3D.
    Transición ...... 9 transiciones entre escenas (máscara, fundido, iris, cortina, deslizar, zoom a través,
                      píxeles QR, desenfoque, corte) con dirección, curva y duración. «Probar en bucle».
    Capas ........... imágenes o videos flotantes; se ubican arrastrándolos en un escenario.
    3D .............. nudo, cristal, esfera líquida, cubo QR de vóxeles… o ★ TU PROPIO MODELO (.glb / .obj).
                      Forma → «Mi modelo 3D» → Subir modelo (o arrastrarlo). Material: colores/texturas del
                      modelo, vidrio o color de acento. Inclinación, giro inicial, giro automático y si gira
                      con el scroll. Se centra y escala solo. Ejemplo: assets/modelos/cubo_qr_ejemplo.glb
                      Exportar desde Blender: Archivo → Exportar → glTF 2.0 → Formato «glTF Binario (.glb)»,
                      SIN «Compresión» (Draco). Ideal: < 100.000 triángulos y < 10 MB.
    Color ........... paleta, medidor de contraste y paletas rápidas.
  Derecha: VISTA PREVIA EN VIVO (sin guardar) en escritorio / tablet / celular, guías de composición,
    reproducir/pausar, repetir la escena, velocidad.
  Abajo: LÍNEA DE TIEMPO. Bloques = escenas (A/B alternadas; donde se superponen está la transición).
    Arrastrá los bordes de fase, el borde derecho (largo), los rombos de cámara y las barras de cada pista.
    Doble clic en la fila Cámara = nuevo keyframe. Ctrl+rueda = zoom. Botón Imán = enganchar a bordes.

ATAJOS: Espacio reproducir · ←/→ mover cursor · [ ] escena ant./sig. · K keyframe · Supr borrar keyframe
        Ctrl+Z / Ctrl+Shift+Z deshacer/rehacer · Ctrl+S guardar · Ctrl+D duplicar escena

EN LA WEB PUBLICADA (ajustes en «General»)
  Índice de escenas (puntos o lista), teclado ↑↓←→ que salta de pausa en pausa, imán de escenas,
  reproducción automática tipo película (se detiene si la persona scrollea y retoma sola), duración global.

GUARDAR Y PUBLICAR
  «Guardar» escribe config.json (copia previa en config.bak.json). Si el panel queda abierto sin guardar,
  al volver ofrece recuperar el borrador. Los archivos subidos van a assets/.
  (a) Hosting estático: editá en tu PC y subí toda la carpeta.
  (b) Servidor propio: ADMIN_PASSWORD=clave HOST=0.0.0.0 python3 server.py (detrás de HTTPS).

ARCHIVOS
  index.html (la web) · app.js (motor) · qr-model.js (modelo compartido) · modelos3d.js (lector .glb/.obj)
  admin.html + admin.js (panel)
  server.py · config.json · config.default.json («Volver a los originales») · assets/
  Las configuraciones viejas se convierten solas al abrirlas. Tu configuración previa quedó en
  config.anterior.json (Panel → ⋯ → Importar config.json para volver a ella).
