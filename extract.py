import sys
try:
    import pypdf
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pypdf"])
    import pypdf

reader = pypdf.PdfReader('d:\\walle-t\\24I-6034_24I-2514_24I-2576_DS-B_Iteration0.pdf')
text = ""
for page in reader.pages:
    text += page.extract_text() + "\n"

with open('d:\\walle-t\\extracted_text.txt', 'w', encoding='utf-8') as f:
    f.write(text)
print("Extracted text to extracted_text.txt")
