package dev.blindarchive;
import android.app.job.*;
public final class UploadJob extends JobService {
 public boolean onStartJob(JobParameters p){new Thread(()->{boolean ok;try(Queue q=new Queue(this)){ok=q.upload(this);}jobFinished(p,!ok);},"blind-retry").start();return true;}
 public boolean onStopJob(JobParameters p){return true;}
}
