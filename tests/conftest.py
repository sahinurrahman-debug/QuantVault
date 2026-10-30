import os
import tempfile

# Experiments save their result artifacts; during tests they go to a temp folder so a test run never rewrites
# the committed files in results/.
os.environ["QUANTVAULT_RESULTS_DIR"] = tempfile.mkdtemp(prefix="quantvault-results-")
