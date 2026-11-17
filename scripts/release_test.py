import importlib.util,pathlib,tempfile,threading,unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer

class ReleaseRecoveryTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=pathlib.Path(self.tmp.name)
  self.file=self.root/'bundle.tar.gz';self.file.write_bytes(b'published bundle');self.body=b'published bundle'
  owner=self
  class Handler(BaseHTTPRequestHandler):
   def do_GET(self):self.send_response(200);self.end_headers();self.wfile.write(owner.body)
   def log_message(self,*args):pass
  self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=self.server.serve_forever,daemon=True).start();self.addCleanup(self.server.server_close);self.addCleanup(self.server.shutdown)
  self.url='http://127.0.0.1:'+str(self.server.server_port)+'/asset'
  path=pathlib.Path(__file__).with_name('release.py');self.module=None
  if path.exists():
   spec=importlib.util.spec_from_file_location('release',path);self.module=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.module)
 def missing(self,assets,files):
  self.assertIsNotNone(self.module,'release recovery implementation is missing')
  return self.module.missing_assets(assets,files)
 def test_existing_matching_asset_needs_no_replacement(self):
  self.assertEqual(self.missing([{'name':self.file.name,'browser_download_url':self.url}],[self.file]),[])
 def test_partial_release_only_needs_the_missing_files(self):
  missing=self.root/'chart.tgz';missing.write_bytes(b'chart')
  self.assertEqual(self.missing([{'name':self.file.name,'browser_download_url':self.url}],[self.file,missing]),[missing])
 def test_changed_existing_asset_is_rejected_without_local_overwrite(self):
  self.body=b'different bytes'
  with self.assertRaises(ValueError):self.missing([{'name':self.file.name,'browser_download_url':self.url}],[self.file])
  self.assertEqual(self.file.read_bytes(),b'published bundle')

if __name__=='__main__':unittest.main()
