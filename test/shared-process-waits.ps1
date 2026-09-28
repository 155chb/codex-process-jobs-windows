# SPDX-License-Identifier: Apache-2.0
# Fixed, harmless real-process test. No Codex notifications or runtime files.
param([string]$NodePath='C:\Program Files\nodejs\node.exe')
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
public static class SharedWaitProof {
  public static void Run(string node) {
    const int n=24;
    var launched=new List<Process>();
    var observed=new List<Process>();
    var results=new ConcurrentDictionary<int,int>();
    var counts=new ConcurrentDictionary<int,int>();
    var errors=new ConcurrentQueue<string>();
    using(var done=new CountdownEvent(n)) {
      try {
        for(int i=0;i<n;i++) {
          var info=new ProcessStartInfo(node);
          info.UseShellExecute=false;info.CreateNoWindow=true;
          info.ArgumentList.Add("-e");
          // Every process remains alive long enough to attach all 24 handles.
          info.ArgumentList.Add("setTimeout(()=>process.exit("+(i%2==0?0:7)+"),5000)");
          launched.Add(Process.Start(info));
        }
        for(int i=0;i<n;i++) {
          int index=i;
          // Reopen independently, as a monitor would; retain the OS handle.
          var p=Process.GetProcessById(launched[i].Id);
          var handle=p.Handle;
          observed.Add(p);
          p.Exited+=(sender,args)=>{
            try {
              int calls=counts.AddOrUpdate(index,1,(key,old)=>old+1);
              results[index]=p.ExitCode;
              if(calls==1)done.Signal();
            } catch(Exception e){errors.Enqueue(e.Message);}
          };
          p.EnableRaisingEvents=true;
        }
        int alive=0;foreach(var p in observed)if(!p.HasExited)alive++;
        Console.WriteLine("Attached real process handles: "+observed.Count+"; simultaneously alive: "+alive);
        if(alive!=n)throw new Exception("Processes exited before concurrency check");
        if(!done.Wait(15000))throw new Exception("Completion timeout");
        if(!errors.IsEmpty)throw new Exception("Callback error");
        for(int i=0;i<n;i++) {
          if(results[i]!=(i%2==0?0:7)||counts[i]!=1)throw new Exception("Exit mismatch or duplicate callback: "+i);
        }
        Console.WriteLine("PASS: 24/24 completion callbacks, 12 exit=0, 12 exit=7; no missing or duplicate results");
      } finally {
        foreach(var p in observed)p.Dispose();
        foreach(var p in launched){try{if(!p.HasExited)p.Kill();}catch{}p.Dispose();}
      }
    }
  }
}
'@
[SharedWaitProof]::Run($NodePath)
