package cz.adadane.app;

import android.app.Activity;
import android.content.ContentValues;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int REQ_FILE = 11;
    private static final int REQ_CAM = 12;
    private PermissionRequest camReq; // čeká na povolení kamery (skenování QR z PC)
    private static final Set<String> ALLOWED = new HashSet<>(Arrays.asList(
            "api.koios.rest", "data-api.binance.vision", "api.binance.com", "www.cnb.cz", "api.coingecko.com", "mempool.space", "eth.blockscout.com", "api.mainnet-beta.solana.com", "blockstream.info", "api.github.com", "raw.githubusercontent.com"));

    private WebView web;
    private WebView printView; // drží se, dokud tisk neskončí
    private ValueCallback<Uri[]> fileCb;
    private final ExecutorService pool = Executors.newFixedThreadPool(3);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0b0f19"));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        // Android 15: obsah jde pod systémové lišty -> odsadit
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setBackgroundColor(Color.parseColor("#0f1420"));
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest req) {
                boolean video = false;
                for (String r : req.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) video = true;
                if (!video) { req.deny(); return; }
                runOnUiThread(() -> {
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        req.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    } else {
                        if (camReq != null) camReq.deny();
                        camReq = req;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM);
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent it = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                it.addCategory(Intent.CATEGORY_OPENABLE);
                it.setType("*/*");
                it.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(it, REQ_FILE);
                } catch (Exception e) {
                    fileCb = null;
                    return false;
                }
                return true;
            }
        });
        web.loadUrl("file:///android_asset/web/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE && fileCb != null) {
            Uri[] res = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    res = new Uri[n];
                    for (int i = 0; i < n; i++) res[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    res = new Uri[]{data.getData()};
                }
            }
            fileCb.onReceiveValue(res);
            fileCb = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQ_CAM && camReq != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED)
                camReq.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else camReq.deny();
            camReq = null;
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    /** synchronizace s PC: jen http na soukromou IPv4 adresu domácí sítě a jen cesty /sync/ */
    private static boolean isLanSync(URL u) {
        if (!"http".equals(u.getProtocol()) || u.getPath() == null || !u.getPath().startsWith("/sync/")) return false;
        String[] p = u.getHost().split("\\.");
        if (p.length != 4) return false;
        int[] a = new int[4];
        try { for (int i = 0; i < 4; i++) { a[i] = Integer.parseInt(p[i]); if (a[i] < 0 || a[i] > 255) return false; } }
        catch (NumberFormatException e) { return false; }
        return a[0] == 10 || (a[0] == 172 && a[1] >= 16 && a[1] <= 31) || (a[0] == 192 && a[1] == 168);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private void callback(String id, boolean ok, int status, String body) {
        String b64 = Base64.encodeToString((body == null ? "" : body).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
        String js = "window.__nativeCb(" + JSONObject.quote(id) + "," + ok + "," + status + ",'" + b64 + "')";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        in.close();
        return bo.toByteArray();
    }

    private File stateFile() {
        return new File(getFilesDir(), "state.json");
    }

    class Bridge {
        @JavascriptInterface
        public void http(final String id, final String method, final String url, final String body, final String headersJson) {
            pool.submit(() -> {
                HttpURLConnection c = null;
                try {
                    URL u = new URL(url);
                    boolean lan = isLanSync(u);
                    if (!lan && (!"https".equals(u.getProtocol()) || !ALLOWED.contains(u.getHost()))) {
                        callback(id, false, 403, "host neni povolen: " + u.getHost());
                        return;
                    }
                    c = (HttpURLConnection) u.openConnection();
                    c.setConnectTimeout(lan ? 2500 : 20000);
                    c.setReadTimeout(lan ? 30000 : 60000);
                    c.setRequestMethod(method);
                    c.setRequestProperty("User-Agent", "ada-dane-android/0.1");
                    c.setRequestProperty("Accept", "application/json, text/plain, */*");
                    if (headersJson != null && !headersJson.isEmpty()) {
                        JSONObject h = new JSONObject(headersJson);
                        Iterator<String> it = h.keys();
                        while (it.hasNext()) {
                            String k = it.next();
                            c.setRequestProperty(k, h.getString(k));
                        }
                    }
                    if (body != null && !body.isEmpty() && !"GET".equals(method)) {
                        c.setDoOutput(true);
                        OutputStream os = c.getOutputStream();
                        os.write(body.getBytes(StandardCharsets.UTF_8));
                        os.close();
                    }
                    int code = c.getResponseCode();
                    InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    byte[] raw = in == null ? new byte[0] : readAll(in);
                    String ctype = String.valueOf(c.getContentType()).toLowerCase();
                    Charset cs = StandardCharsets.UTF_8;
                    if (u.getHost().endsWith("cnb.cz") && !ctype.contains("utf")) cs = Charset.forName("windows-1250");
                    callback(id, code < 400, code, new String(raw, cs));
                } catch (Exception e) {
                    callback(id, false, 0, String.valueOf(e));
                } finally {
                    if (c != null) c.disconnect();
                }
            });
        }

        @JavascriptInterface
        public String loadState() {
            try {
                File f = stateFile();
                if (!f.exists()) return "";
                return new String(readAll(new FileInputStream(f)), StandardCharsets.UTF_8);
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void saveState(String json) {
            try {
                File f = stateFile();
                File tmp = new File(getFilesDir(), "state.json.tmp");
                FileOutputStream fo = new FileOutputStream(tmp);
                fo.write(json.getBytes(StandardCharsets.UTF_8));
                fo.close();
                if (f.exists()) {
                    File bak = new File(getFilesDir(), "state.json.bak");
                    if (bak.exists()) bak.delete();
                    f.renameTo(bak);
                }
                tmp.renameTo(f);
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public String saveFile(String name, String mime, String content) {
            byte[] data = content.getBytes(StandardCharsets.UTF_8);
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Krypto-sprava");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    os.write(data);
                    os.close();
                    return "Stažené soubory/Krypto-sprava/" + name;
                } else {
                    File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Krypto-sprava");
                    dir.mkdirs();
                    File f = new File(dir, name);
                    FileOutputStream fo = new FileOutputStream(f);
                    fo.write(data);
                    fo.close();
                    return f.getAbsolutePath();
                }
            } catch (Exception e) {
                return "CHYBA: " + e.getMessage();
            }
        }

        /** PDF zpráva: vykreslí HTML do skrytého WebView a otevře systémový tisk (volba „Uložit jako PDF“). */
        @JavascriptInterface
        public void printHtml(final String html, final String title) {
            runOnUiThread(() -> {
                final WebView pv = new WebView(MainActivity.this);
                printView = pv;
                pv.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                        PrintDocumentAdapter ad = view.createPrintDocumentAdapter(title);
                        pm.print(title, ad, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
                    }
                });
                pv.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            });
        }
    }
}
