package dev.blindarchive;
import android.content.*;
import android.service.notification.NotificationListenerService;
public final class BootReceiver extends BroadcastReceiver {
 public void onReceive(Context c,Intent i){Queue.schedule(c);NotificationListenerService.requestRebind(new ComponentName(c,BlindListener.class));}
}
