import numpy as np
from sklearn.datasets import fetch_olivetti_faces
from PIL import Image
d = fetch_olivetti_faces()               # 400 imgs, 64x64, float [0,1], target=subject id 0..39
X = (d.images * 255).astype('uint8')     # (400,64,64) uint8
y = d.target.astype('uint8')             # (400,)
np.savez_compressed('faces_all.npz', images=X, subject=y)
print('saved faces_all.npz', X.shape, X.dtype, 'subjects', y.min(), y.max())
# montage: first image of each of the 40 subjects, 8 cols x 5 rows, labeled
cols, rows, s = 8, 5, 64
canvas = Image.new('L', (cols*s, rows*s), 0)
for subj in range(40):
    idx = np.where(y==subj)[0][0]
    im = Image.fromarray(X[idx])
    canvas.paste(im, ((subj%cols)*s, (subj//cols)*s))
canvas = canvas.resize((cols*s*2, rows*s*2), Image.NEAREST)
canvas.save('subjects_montage.png')
print('saved subjects_montage.png  (subject index = row*8+col, 0-based, reading L-to-R top-to-bottom)')
