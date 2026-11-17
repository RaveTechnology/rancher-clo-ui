import gzip,importlib.util,io,json,pathlib,tarfile,tempfile,unittest

class DistributionTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  root=pathlib.Path(self.tmp.name);self.source=root/'build';self.site=root/'site';self.source.mkdir()
  (self.source/'package.json').write_text(json.dumps({'name':'clo-ui','version':'1.2.3'}))
  (self.source/'clo-ui-1.2.3.umd.min.js').write_text('main')
  (self.source/'nested').mkdir();(self.source/'nested/chunk.js').write_text('chunk')
  (self.source/'nested/style.css').write_text('style')
  (self.source/'main.js.map').write_text('source map');(self.source/'report.html').write_text('report')
  path=pathlib.Path(__file__).with_name('distribution.py')
  self.module=None
  if path.exists():
   spec=importlib.util.spec_from_file_location('distribution',path);self.module=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.module)
 def prepare(self):
  self.assertIsNotNone(self.module,'versioned UI distribution implementation is missing')
  return self.module.prepare_ui(self.source,self.site,'1.2.3')
 def test_complete_nested_download_set_preserves_existing_versions(self):
  old=self.site/'clo-ui/1.2.2/plugin/old.js';old.parent.mkdir(parents=True);old.write_bytes(b'old version')
  target=self.prepare();listed=(target/'files.txt').read_text().splitlines()
  self.assertEqual(set(listed),{'plugin/package.json','plugin/clo-ui-1.2.3.umd.min.js','plugin/nested/chunk.js','plugin/nested/style.css'})
  self.assertEqual((target/'plugin/nested/style.css').read_bytes(),b'style')
  self.assertFalse((target/'plugin/main.js.map').exists());self.assertFalse((target/'plugin/report.html').exists())
  self.assertEqual(old.read_bytes(),b'old version')
 def test_changed_published_version_is_rejected_without_overwriting(self):
  target=self.prepare();(self.source/'nested/chunk.js').write_bytes(b'changed')
  with self.assertRaises(ValueError):self.prepare()
  self.assertEqual((target/'plugin/nested/chunk.js').read_bytes(),b'chunk')
 def test_same_bytes_can_be_verified_again(self):
  self.assertEqual(self.prepare(),self.prepare())
 def test_external_symlink_cannot_enter_public_assets(self):
  secret=self.source.parent/'private';secret.write_bytes(b'private input');(self.source/'unexpected.js').symlink_to(secret)
  with self.assertRaises(ValueError):self.prepare()
  self.assertFalse((self.site/'clo-ui/1.2.3').exists())
 def chart(self,path,body,mtime):
  with path.open('wb') as out,gzip.GzipFile(fileobj=out,mode='wb',mtime=mtime) as zipped,tarfile.open(fileobj=zipped,mode='w') as archive:
   info=tarfile.TarInfo('clo-ui/Chart.yaml');info.size=len(body);info.mtime=mtime;info.mode=0o644;archive.addfile(info,io.BytesIO(body))
 def test_chart_retry_keeps_the_first_published_bytes(self):
  self.assertTrue(hasattr(self.module,'publish_chart'),'immutable chart retry handling is missing')
  previous=self.source.parent/'published.tgz';candidate=self.source.parent/'candidate.tgz'
  self.chart(previous,b'version: 1.2.3',1);original=previous.read_bytes();self.chart(candidate,b'version: 1.2.3',2)
  self.assertNotEqual(candidate.read_bytes(),original)
  self.module.publish_chart(candidate,previous)
  self.assertEqual(previous.read_bytes(),original);self.assertEqual(candidate.read_bytes(),original)
 def test_chart_content_change_cannot_overwrite_published_version(self):
  self.assertTrue(hasattr(self.module,'publish_chart'),'immutable chart retry handling is missing')
  previous=self.source.parent/'published.tgz';candidate=self.source.parent/'candidate.tgz'
  self.chart(previous,b'version: 1.2.3',1);original=previous.read_bytes();self.chart(candidate,b'version: 9.9.9',2)
  with self.assertRaises(ValueError):self.module.publish_chart(candidate,previous)
  self.assertEqual(previous.read_bytes(),original)

if __name__=='__main__':unittest.main()
