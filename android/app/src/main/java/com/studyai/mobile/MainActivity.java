package com.studyai.mobile;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import org.json.JSONArray;

public class MainActivity extends BridgeActivity {
    private Intent pendingShare;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        pendingShare = getIntent();
        getBridge().getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface public void ready() { runOnUiThread(() -> deliverShare(pendingShare)); }
        }, "StudyAINative");
        getBridge().getWebView().post(() -> deliverShare(pendingShare));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        pendingShare = intent;
        deliverShare(intent);
    }

    private void deliverShare(Intent intent) {
        if (intent == null || getBridge() == null) return;
        ArrayList<Uri> items = new ArrayList<>();
        String action = intent.getAction();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) items.add(uri);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (uris != null) items.addAll(uris);
        } else if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            items.add(intent.getData());
        }
        if (items.isEmpty()) return;
        JSONArray urls = new JSONArray();
        for (Uri item : items) urls.put(item.toString());
        String script = "window.dispatchEvent(new CustomEvent('studyaiNativeShare',{detail:{urls:" + urls + "}}));location.href='/importar';";
        getBridge().getWebView().evaluateJavascript(script, null);
        pendingShare = null;
    }
}
