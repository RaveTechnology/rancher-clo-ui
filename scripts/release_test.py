import importlib.util,pathlib,tempfile,threading,unittest
from unittest.mock import patch
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
 def test_draft_is_found_when_the_tag_endpoint_does_not_return_it(self):
  self.assertTrue(hasattr(self.module,'select_release'),'draft-aware release lookup is missing')
  draft={'id':7,'tag_name':'v1.2.3','draft':True}
  self.assertEqual(self.module.select_release('v1.2.3',None,[{'id':6,'tag_name':'v1.2.2','draft':False},draft]),draft)
 def test_existing_published_tag_is_selected_without_a_new_draft(self):
  self.assertTrue(hasattr(self.module,'select_release'),'draft-aware release lookup is missing')
  published={'id':7,'tag_name':'v1.2.3','draft':False}
  self.assertEqual(self.module.select_release('v1.2.3',published,[]),published)
 def test_ambiguous_drafts_do_not_authorize_arbitrary_upload(self):
  self.assertTrue(hasattr(self.module,'select_release'),'draft-aware release lookup is missing')
  with self.assertRaises(ValueError):self.module.select_release('v1.2.3',None,[{'id':7,'tag_name':'v1.2.3','draft':True},{'id':8,'tag_name':'v1.2.3','draft':True}])


 def test_created_draft_can_appear_after_several_reads(self):
  self.assertTrue(hasattr(self.module,'await_release'),'post-create read reconciliation is missing')
  draft={'id':7,'tag_name':'v1.2.3','draft':True}
  with patch.object(self.module,'find_release',side_effect=[None,None,draft]) as lookup,patch.object(self.module.time,'sleep'):
   self.assertEqual(self.module.await_release('owner/repo','v1.2.3'),draft)
   self.assertEqual(lookup.call_count,3)
 def test_unobservable_draft_reconciliation_is_bounded(self):
  self.assertTrue(hasattr(self.module,'await_release'),'post-create read reconciliation is missing')
  with patch.object(self.module,'find_release',return_value=None) as lookup,patch.object(self.module.time,'sleep'):
   self.assertIsNone(self.module.await_release('owner/repo','v1.2.3'))
   self.assertEqual(lookup.call_count,4)

if __name__=='__main__':unittest.main()
