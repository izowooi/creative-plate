package dev.blindarchive;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.*;
import android.util.Patterns;
import java.util.regex.*;
import org.json.JSONObject;

public final class BlindListener extends NotificationListenerService {
    public void onListenerConnected(){for(StatusBarNotification n:getActiveNotifications())onNotificationPosted(n);Queue.schedule(this);}
    public void onNotificationPosted(StatusBarNotification sbn) {
        // Only the official Blind package; never forward other apps' notifications.
        if(!"com.teamblind.blind".equals(sbn.getPackageName()))return;
        Notification n=sbn.getNotification();
        if((n.flags & Notification.FLAG_GROUP_SUMMARY)!=0)return;
        try {
            Bundle e=n.extras;
            String title=String.valueOf(e.getCharSequence(Notification.EXTRA_TITLE,""));
            String body=String.valueOf(e.getCharSequence(Notification.EXTRA_BIG_TEXT,e.getCharSequence(Notification.EXTRA_TEXT,"")));
            String url="";
            // Read exposed strings only. Do not introspect PendingIntent or private app storage.
            for(String key:e.keySet()) {
                Object value=e.get(key);
                if(value instanceof CharSequence) {
                    Matcher m=Pattern.compile("https://www\\.teamblind\\.com/kr/post/[^\\s<>\\\"]+").matcher(value.toString());
                    if(m.find()){url=m.group();break;}
                }
            }
            JSONObject obj=new JSONObject();obj.put("event_key",sbn.getKey()+":"+sbn.getPostTime()+":"+title.hashCode()+":"+body.hashCode());
            obj.put("posted_at",sbn.getPostTime());obj.put("title",title);obj.put("body",body);obj.put("url",url);
            try(Queue q=new Queue(this)){q.add(obj);}
            getSharedPreferences("settings",0).edit().putLong("last_received",System.currentTimeMillis()).apply();
            new Thread(()->{try(Queue q=new Queue(this)){if(!q.upload(this))Queue.schedule(this);}},"blind-upload").start();
        } catch(Exception ex){getSharedPreferences("settings",0).edit().putString("last_status","알림 저장 실패: "+ex.getClass().getSimpleName()).apply();}
    }
}
