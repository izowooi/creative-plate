package dev.blindarchive;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import android.app.job.*;
import org.json.JSONObject;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

final class Queue extends SQLiteOpenHelper {
    Queue(Context c) { super(c,"notifications.sqlite",null,1); }
    public void onCreate(SQLiteDatabase db) { db.execSQL("CREATE TABLE queue(id INTEGER PRIMARY KEY,payload TEXT NOT NULL)"); }
    public void onUpgrade(SQLiteDatabase d,int a,int b) {}
    void add(JSONObject obj) { ContentValues v=new ContentValues();v.put("payload",obj.toString());getWritableDatabase().insert("queue",null,v); }
    int size() { try(Cursor c=getReadableDatabase().rawQuery("SELECT count(*) FROM queue",null)){ c.moveToFirst();return c.getInt(0); } }
    static boolean localUrl(String raw) {
        try {
            URI u=new URI(raw);
            if(!"http".equals(u.getScheme()) || u.getHost()==null || u.getUserInfo()!=null || u.getQuery()!=null || u.getFragment()!=null) return false;
            String h=u.getHost();
            if(!h.matches("[0-9.]+")) return false;
            InetAddress a=InetAddress.getByName(h);
            return a.isSiteLocalAddress() || a.isLoopbackAddress();
        } catch(Exception e){return false;}
    }
    static void schedule(Context c) {
        JobScheduler js=(JobScheduler)c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        js.schedule(new JobInfo.Builder(7,new ComponentName(c,UploadJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).setMinimumLatency(1000).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build());
    }
    boolean upload(Context ctx) {
        SharedPreferences prefs=ctx.getSharedPreferences("settings",0);
        String base=prefs.getString("server","");String token=prefs.getString("token","");
        if(!localUrl(base)||token.isEmpty())return false;
        try(Cursor c=getReadableDatabase().rawQuery("SELECT id,payload FROM queue ORDER BY id LIMIT 100",null)) {
            while(c.moveToNext()) {
                HttpURLConnection conn=null;
                try {
                    conn=(HttpURLConnection)new URL(base.replaceAll("/+$","")+"/api/notifications").openConnection();
                    conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(8000);conn.setReadTimeout(10000);conn.setRequestMethod("POST");conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type","application/json");conn.setRequestProperty("Authorization","Bearer "+token);
                    byte[] bytes=c.getString(1).getBytes(StandardCharsets.UTF_8);conn.setFixedLengthStreamingMode(bytes.length);
                    try(OutputStream out=conn.getOutputStream()){out.write(bytes);}
                    int status=conn.getResponseCode();
                    if(status<200||status>=300){prefs.edit().putString("last_status","서버 응답 "+status).apply();return false;}
                    getWritableDatabase().delete("queue","id=?",new String[]{c.getString(0)});
                    prefs.edit().putString("last_status","전송 성공").putLong("last_sent",System.currentTimeMillis()).apply();
                } catch(Exception e){prefs.edit().putString("last_status","연결 실패: "+e.getClass().getSimpleName()).apply();return false;}
                finally{if(conn!=null)conn.disconnect();}
            }
            return size()==0;
        }
    }
}
