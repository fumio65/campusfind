package com.nwssu.campusfind;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

// Saves a file straight into a named album under Pictures/ via the
// MediaStore API - no picker, no storage permission needed on Android 10+
// (Scoped Storage explicitly allows an app to add its own new media without
// any permission grant), and it shows up in Gallery/Photos immediately,
// since Pictures/<album> subfolders are what those apps actually scan.
// The Downloads folder (what a plain ACTION_CREATE_DOCUMENT "Save As" picker
// defaults to) is not scanned as a photo album, which is what this replaces.
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    @PluginMethod
    public void saveToGallery(PluginCall call) {
        String sourcePath = call.getString("sourcePath");
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "image/png");
        String albumName = call.getString("albumName", "CampusFind");

        if (sourcePath == null || filename == null) {
            call.reject("sourcePath and filename are required");
            return;
        }

        try {
            Uri destUri = insertMediaStoreEntry(filename, mimeType, albumName);
            if (destUri == null) {
                call.reject("Could not create a gallery entry for this file");
                return;
            }

            copyFile(sourcePath, destUri);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues doneValues = new ContentValues();
                doneValues.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContext().getContentResolver().update(destUri, doneValues, null, null);
            }

            JSObject ret = new JSObject();
            ret.put("uri", destUri.toString());
            call.resolve(ret);
        } catch (IOException e) {
            call.reject("Failed to save file: " + e.getMessage());
        }
    }

    private Uri insertMediaStoreEntry(String filename, String mimeType, String albumName) {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + albumName);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        } else {
            // Pre-Q: no RELATIVE_PATH/Scoped Storage - point DATA at a real
            // path under the public Pictures dir (needs WRITE_EXTERNAL_STORAGE,
            // already declared for this SDK range in AndroidManifest.xml).
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), albumName);
            if (!dir.exists()) dir.mkdirs();
            values.put(MediaStore.MediaColumns.DATA, new File(dir, filename).getAbsolutePath());
        }

        return resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
    }

    private void copyFile(String sourcePath, Uri destUri) throws IOException {
        String path = Uri.parse(sourcePath).getPath();
        ContentResolver resolver = getContext().getContentResolver();
        try (
            InputStream in = new FileInputStream(new File(path));
            OutputStream out = resolver.openOutputStream(destUri)
        ) {
            if (out == null) throw new IOException("Could not open output stream for destination");
            byte[] buffer = new byte[8192];
            int len;
            while ((len = in.read(buffer)) != -1) {
                out.write(buffer, 0, len);
            }
        }
    }
}
