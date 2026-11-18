# <img src="icon.svg" width="32" height="32" alt=""> TanyaJer

Web app soal jawab untuk penonton video tutorial. Setiap aplikasi (Canva, CapCut, dll.) ada FAQ sendiri. Penonton pilih aplikasi, taip soalan, dan app akan cari jawapan yang paling padan dalam FAQ, walaupun soalan ditulis secara santai (contohnya "cmne nk buang watermark").

- Percuma dan dihoskan di **GitHub Pages**. Penonton tak perlu log masuk.
- Upload fail FAQ ke folder `faqs/`, dan laman akan dikemas kini sendiri dalam ~1 minit.
- Setiap app ada link sendiri, contohnya `…/tanya-app/#canva`, untuk diletak dalam description video.

---

## 🚀 Persediaan (sekali sahaja)

1. Buka repo ini di GitHub, kemudian pergi ke **Settings → Pages**.
2. Di bawah **Build and deployment → Source**, pilih **GitHub Actions**.
3. Pergi ke tab **Actions**, pilih **Bina & terbit TanyaJer**, kemudian klik **Run workflow**.
4. Selepas siap (tanda ✅ hijau), laman anda boleh dibuka di:
   `https://<nama-pengguna>.github.io/<nama-repo>/`

---

## ⚙️ Urus FAQ dari laman (paling mudah)

Buka **`https://<nama-pengguna>.github.io/<nama-repo>/admin.html`** (atau tekan **⚙️ Urus FAQ** di bawah senarai app).

- **+ Tambah app:** isi nama, emoji dan penerangan, pilih fail FAQ, kemudian tekan **Simpan & terbit**
- **⬆️ Upload FAQ:** ganti FAQ lama, atau tambah fail baru dan kekalkan fail lama
- **✏️ Edit:** tukar nama, emoji atau penerangan app
- **Padam:** buang app dan fail FAQnya

Sebelum disimpan, halaman ini tunjuk pratonton soalan yang dijumpai dalam fail. Selepas simpan, ia pantau penerbitan sehingga keluar mesej **✅ Dah live**.

**Kali pertama sahaja**, halaman admin perlukan *fine-grained token* GitHub:
1. Buka https://github.com/settings/personal-access-tokens/new
2. **Repository access:** *Only select repositories*, kemudian pilih repo ini
3. **Permissions:** **Contents** = *Read and write*, dan **Actions** = *Read-only*
4. Klik **Generate token**, kemudian tampal token di halaman admin

Token hanya disimpan dalam browser anda. Pengunjung lain tidak boleh mengubah apa-apa tanpa token. Jangan kongsi token anda dengan sesiapa.

## ✨ Jawapan ringkas (AI)

TanyaJer menjawab secara **ringkas**. Ia tunjuk rumusan jawapan, dan jika soalan penonton menyebut perkara khusus (contohnya "bujang layak ke?"), hanya poin yang berkaitan dipaparkan. Jawapan asal sentiasa boleh dibuka melalui butang **Baca jawapan penuh**.

Untuk ringkasan yang dijana oleh **Claude AI**, tambah API key sekali sahaja:

1. Dapatkan API key di https://console.anthropic.com → **API Keys → Create Key**
2. Dalam repo ini, pergi ke **Settings → Secrets and variables → Actions → New repository secret**
3. **Name:** `ANTHROPIC_API_KEY` dan **Secret:** tampal API key, kemudian tekan **Add secret**
4. Jalankan semula: tab **Actions → Bina & terbit TanyaJer → Run workflow** (atau upload apa-apa FAQ)

- Setiap jawapan hanya diringkaskan **sekali**. Hasilnya disimpan, dan hanya FAQ baru atau yang berubah dihantar semula ke AI. Kosnya sangat rendah, biasanya beberapa sen untuk satu fail FAQ.
- Jawapan pendek tidak diringkaskan.
- API key tidak pernah didedahkan kepada penonton. Ia hanya digunakan oleh GitHub Actions semasa membina laman.
- Tanpa API key, TanyaJer tetap meringkaskan jawapan secara automatik (ambil ayat pertama dan senarai), tetapi tidak sepintar AI.
- Untuk menukar model AI, tambah *Repository variable* atau secret `TANYA_MODEL` (lalai: `claude-haiku-5-5`).

## ➕ Tambah atau kemas kini FAQ terus di GitHub

1. Buka folder **`faqs/`** di GitHub.
2. Klik **Add file → Upload files**, kemudian seret fail FAQ anda.
3. Klik **Commit changes**.
4. Tunggu ~1 minit, dan FAQ baru akan muncul di laman.

**Nama fail menjadi ID dan link app.** Contohnya, `faqs/canva.csv` akan menjadi `#canva`.
Untuk mengemas kini FAQ, upload fail dengan nama yang sama (ia akan menggantikan fail lama). Untuk memadam app, padam failnya.
Untuk menambah lebih dari satu fail bagi app yang sama, guna `__` dalam nama fail. Contohnya, `canva__bahagian2.pdf` akan digabungkan ke dalam `#canva`.

### Format fail yang disokong

| Format | Cara tulis |
|---|---|
| **CSV** (`.csv`) | 2 lajur: `soalan,jawapan`. Baris tajuk adalah pilihan. Boleh dieksport dari Excel atau Google Sheets. |
| **TXT / Markdown** (`.txt`, `.md`) | Guna label `S:` / `J:` (atau `Q:` / `A:`). Contoh di bawah. |
| **Word** (`.docx`) | Sama seperti TXT: label `S:`/`J:`, atau soalan berakhir dengan `?` dan jawapan di baris bawahnya. |
| **PDF** (`.pdf`) | Sama seperti Word. PDF hasil imbasan (gambar) tidak boleh dibaca. |
| **JSON** (`.json`) | `[{"q": "soalan", "a": "jawapan"}]` |

**Contoh TXT:**
```
S: Macam mana nak buang background gambar?
J: Klik gambar, pilih Edit, kemudian BG Remover.

S: Boleh guna di telefon?
J: Boleh. Ada app untuk Android dan iOS.
```

Format juga dikesan secara automatik jika setiap soalan berakhir dengan tanda `?`, atau jika anda guna tajuk Markdown (`## Soalan`).

**Format dalam jawapan:** `**tebal**`, `*condong*`, senarai `1.` / `-`, dan link `https://…` akan dipaparkan dengan kemas. Link YouTube dengan cap masa (contohnya `https://youtu.be/xxxx?t=222`) sesuai untuk menunjuk penonton ke minit tertentu.

> 💡 **Ada transkrip atau subtitle video?** Minta Claude atau ChatGPT tukar transkrip itu kepada format `S:`/`J:`, kemudian upload hasilnya.

---

## 🎨 Nama, ikon & tetapan laman — `config.json`

```json
{
  "site": {
    "title": "TanyaJer",
    "heading": "Ada soalan tentang app dalam tutorial?",
    "tagline": "Pilih aplikasi, kemudian taip soalan anda.",
    "contactUrl": "https://www.youtube.com/@channelanda",
    "contactLabel": "Tanya di ruangan komen YouTube"
  },
  "apps": {
    "canva":  { "name": "Canva",  "emoji": "🎨", "description": "Tutorial design poster", "order": 1 },
    "capcut": { "name": "CapCut", "emoji": "🎬", "description": "Tutorial edit video",   "order": 2 }
  }
}
```

- Kunci dalam `apps` mesti sama dengan nama fail (tanpa sambungan).
- Jika sesuatu app tiada dalam `config.json`, nama dijana dari nama fail dan ikonnya 📱.
- `contactUrl` (pilihan) memaparkan butang "tanya terus" bila jawapan tidak dijumpai.

---

## 🛠️ Jika FAQ tidak muncul

Buka tab **Actions** dan klik run terkini. Amaran ⚠️ seperti *"tiada soalan dijumpai"* bermakna format fail tidak dikenali. Semak format di atas.

## 💻 Pratonton di komputer (pilihan)

Perlukan Node.js 20 ke atas.

```bash
npm install
npm run dev     # buka http://localhost:8080
```

## 📁 Struktur projek

```
faqs/                 ← fail FAQ anda (satu fail = satu app)
config.json           ← nama, ikon, tetapan laman
index.html, app.js    ← antara muka penonton
admin.html, admin.js  ← halaman urus FAQ (guna GitHub API)
style.css             ← gaya dikongsi
src/faq-core.js       ← penghurai fail + enjin carian
scripts/build.mjs     ← tukar faqs/ → data/apps.json
scripts/summarize.mjs ← ringkasan jawapan (Claude AI atau automatik)
.github/workflows/    ← bina & terbit automatik ke GitHub Pages
```
