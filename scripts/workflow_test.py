"""Check that a retry can select its own Pages artifact unambiguously."""
import pathlib,unittest,yaml

class PagesRetryTests(unittest.TestCase):
 def test_attempts_publish_and_deploy_distinct_matching_artifacts(self):
  workflow=yaml.safe_load((pathlib.Path(__file__).resolve().parents[1]/'.github/workflows/build.yml').read_text())
  steps=workflow['jobs']['release']['steps']
  upload=next(s for s in steps if s.get('uses','').startswith('actions/upload-pages-artifact@'))
  deploy=next(s for s in steps if s.get('uses','').startswith('actions/deploy-pages@'))
  uploaded=[]
  for attempt in [1,2]:
   def resolve(value):return value.replace('${{ github.run_attempt }}',str(attempt))
   upload_name=resolve(upload.get('with',{}).get('name','github-pages'))
   deploy_name=resolve(deploy.get('with',{}).get('artifact_name','github-pages'))
   uploaded.append(upload_name)
   self.assertEqual(uploaded.count(deploy_name),1,'deploy must identify exactly its own artifact across retries')

if __name__=='__main__':unittest.main()
