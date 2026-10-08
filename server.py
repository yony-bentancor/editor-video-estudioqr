#!/usr/bin/env python3
"""Editor local: proyectos independientes, medios, audio y copias ZIP."""
from pathlib import Path
import http.server,json,os,re,time,hmac,shutil,urllib.parse,zipfile,io,uuid,threading
ROOT=Path(__file__).resolve().parent
PROJECTS=ROOT/'proyectos'
MAX=120*1024*1024
IMG={'.jpg','.jpeg','.png','.webp','.avif','.gif'};VID={'.mp4','.webm'};MOD={'.glb','.obj'};AUD={'.mp3','.wav','.ogg','.m4a','.aac','.flac'}
EXT=IMG|VID|MOD|AUD
LOCK=threading.Lock()
def key():return os.environ.get('ADMIN_PASSWORD') or (ROOT/'admin-password.txt').read_text(encoding='utf-8').strip()
def valid(c):
 if not isinstance(c,dict) or not isinstance(c.get('general'),dict) or not isinstance(c.get('scenes'),list) or not c['scenes']:raise ValueError('El archivo no contiene un proyecto válido.')
 return c
def save(p,c):
 data=json.dumps(valid(c),ensure_ascii=False,indent=2);tmp=p.with_suffix('.tmp');tmp.write_text(data,encoding='utf8');tmp.replace(p)
def meta(p):
 c=json.loads((p/'config.json').read_text(encoding='utf-8'));return {'id':p.name,'name':c.get('project',{}).get('name',p.name),'scenes':len(c.get('scenes',[])),'duration':c.get('general',{}).get('duration',44),'tracks':len(c.get('audio',{}).get('tracks',[]))}
class H(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kw):super().__init__(*args,directory=str(ROOT),**kw)
 def log_message(self,*a):pass
 def end_headers(self):self.send_header('Cache-Control','no-store');super().end_headers()
 def j(self,status,data):
  b=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def do_GET(self):
  path=urllib.parse.urlsplit(self.path).path
  if path=='/api/projects':
   out=[]
   for p in sorted(PROJECTS.iterdir()):
    if p.is_dir() and (p/'config.json').exists():
     try:out.append(meta(p))
     except (ValueError,KeyError):pass
   return self.j(200,{'projects':out})
  target=Path(self.translate_path(path)).resolve()
  if target.is_relative_to(ROOT/'editor/template') or not target.is_relative_to(ROOT) or target.name in {'admin-password.txt','server.py','config.bak.json'} or target.suffix in {'.py','.tmp'}:return self.send_error(404)
  m=re.fullmatch(r'/api/projects/([a-z0-9_-]+)/export',path)
  if m:
   p=PROJECTS/m[1]
   if not (p/'config.json').is_file():return self.send_error(404)
   b=io.BytesIO()
   with zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z:
    z.write(p/'config.json','config.json')
    for f in (p/'assets').rglob('*'):
     if f.is_file() and f.suffix.lower() in EXT:z.write(f,str(f.relative_to(p)))
   data=b.getvalue();self.send_response(200);self.send_header('Content-Type','application/zip');self.send_header('Content-Disposition',f'attachment; filename="{m[1]}.zip"');self.send_header('Content-Length',str(len(data)));self.end_headers();return self.wfile.write(data)
  if self.headers.get('Range') and target.is_file():
   try:
    m=re.fullmatch(r'bytes=(\d*)-(\d*)',self.headers['Range']);size=target.stat().st_size
    if not m:raise ValueError()
    start=int(m[1]) if m[1] else max(0,size-int(m[2]));end=min(int(m[2]),size-1) if m[1] and m[2] else size-1
    if start>end:raise ValueError()
   except ValueError:return self.send_error(416)
   self.send_response(206);self.send_header('Content-Type',self.guess_type(str(target)));self.send_header('Accept-Ranges','bytes');self.send_header('Content-Range',f'bytes {start}-{end}/{size}');self.send_header('Content-Length',str(end-start+1));self.end_headers()
   with target.open('rb') as f:f.seek(start);self.wfile.write(f.read(end-start+1))
   return
  super().do_GET()
 def do_POST(self):
  if not hmac.compare_digest(self.headers.get('X-Key',''),key()):self.close_connection=True;return self.j(401,{'error':'Ingresá la contraseña del editor.'})
  try:
   n=int(self.headers.get('Content-Length','0'))
   if n>MAX:raise ValueError('Máximo 120 MB por archivo.')
   body=self.rfile.read(n);path=urllib.parse.urlsplit(self.path).path
   with LOCK:result=self.mutate(path,body)
   self.j(200,result)
  except (ValueError,KeyError,zipfile.BadZipFile) as e:self.j(400,{'error':str(e)})
  except OSError:self.j(500,{'error':'No se pudo guardar el archivo.'})
 def mutate(self,path,body):
  m=re.fullmatch(r'/api/projects/([a-z0-9_-]+)/delete',path)
  if m:
   p=PROJECTS/m[1]
   if not p.is_dir() or p.is_symlink() or not (p/'config.json').is_file():raise ValueError('Proyecto no encontrado.')
   shutil.rmtree(p)
   return {'ok':True,'deleted':m[1]}
  if path in ['/api/projects/create','/api/projects/import']:
   data={} if path.endswith('import') else json.loads(body)
   source=data.get('source')
   if source is not None and (not isinstance(source,str) or not re.fullmatch('[a-z0-9_-]+',source)):raise ValueError('Proyecto de origen inválido.')
   source_path=PROJECTS/source if source else ROOT/'editor/template'
   if not (source_path/'config.json').is_file():raise ValueError('Proyecto de origen inválido.')
   cfg=json.loads((source_path/'config.json').read_text(encoding='utf-8'));files=[]
   if path.endswith('import'):
    if body[:2]==b'PK':
     z=zipfile.ZipFile(io.BytesIO(body));configs=[x for x in z.namelist() if x.endswith('/config.json') or x=='config.json']
     if len(configs)!=1:raise ValueError('Importá un ZIP de un solo proyecto. Usá Exportar ZIP desde el editor.')
     if sum(x.file_size for x in z.infolist())>300*1024*1024:raise ValueError('El ZIP descomprimido supera 300 MB.')
     configpath=configs[0];prefix=configpath[:-len('config.json')];cfg=valid(json.loads(z.read(configpath)))
     for item in z.infolist():
      if item.is_dir() or not item.filename.startswith(prefix+'assets/'):continue
      rel=Path(item.filename[len(prefix):])
      if '..' in rel.parts or '\\' in str(rel) or ':' in str(rel) or rel.is_absolute() or rel.suffix.lower() not in EXT:continue
      files.append((rel,z.read(item)))
    else:cfg=valid(json.loads(body))
   elif not data.get('source'):
    scene=cfg['scenes'][0];scene.update(name='Primera escena',title='Tu nueva idea',text='',media='',layers=[],length=300);scene['phases']['exit']=0;cfg['scenes']=[scene];cfg['audio']={'tracks':[]};cfg['general']['duration']=30
   name=str(data.get('name') or cfg.get('project',{}).get('name') or 'Proyecto importado').strip()[:100]
   cfg['project']={'name':name};ident='proyecto-'+uuid.uuid4().hex[:10];p=PROJECTS/ident
   try:
    shutil.copytree(source_path,p)
    for rel,content in files:(p/rel).parent.mkdir(parents=True,exist_ok=True);(p/rel).write_bytes(content)
    save(p/'config.json',cfg);save(p/'config.default.json',cfg)
   except Exception:
    shutil.rmtree(p,ignore_errors=True);raise
   return meta(p)
  m=re.fullmatch(r'/proyectos/([a-z0-9_-]+)/api/(ping|assets|config|upload|rename)',path)
  if not m or not (PROJECTS/m[1]/'config.json').exists():raise ValueError('Proyecto no encontrado.')
  p=PROJECTS/m[1];action=m[2]
  if action=='ping':return {'ok':True}
  if action=='assets':
   return {'files':[{'path':str(f.relative_to(p)),'size':f.stat().st_size,'mtime':int(f.stat().st_mtime),'kind':'audio' if f.suffix.lower() in AUD else 'video' if f.suffix.lower() in VID else 'model' if f.suffix.lower() in MOD else 'image'} for f in (p/'assets').rglob('*') if f.is_file() and f.suffix.lower() in EXT]}
  if action=='config':
   c=valid(json.loads(body));shutil.copyfile(p/'config.json',p/'config.bak.json');save(p/'config.json',c);return {'ok':True}
  if action=='rename':
   c=json.loads((p/'config.json').read_text(encoding='utf-8'));c['project']={'name':str(json.loads(body)['name'])[:100]};save(p/'config.json',c);return meta(p)
  name=urllib.parse.unquote(self.headers.get('X-Filename','file'));ext=Path(name).suffix.lower()
  if ext not in EXT:raise ValueError('Formato no admitido.')
  folder='audio' if ext in AUD else 'video' if ext in VID else 'modelos' if ext in MOD else 'fotos'
  rel=Path('assets')/folder/(uuid.uuid4().hex[:8]+'_'+re.sub(r'[^A-Za-z0-9._-]','_',Path(name).stem)[:40]+ext)
  (p/rel).parent.mkdir(parents=True,exist_ok=True);(p/rel).write_bytes(body);return {'path':str(rel)}
if __name__=='__main__':
 port=int(os.environ.get('PORT','8000'));print(f'Editor: http://localhost:{port}/');http.server.ThreadingHTTPServer(('127.0.0.1',port),H).serve_forever()
