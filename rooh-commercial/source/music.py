import numpy as np, wave, sys
SR=48000; D=10.0; N=int(SR*D)
rng=np.random.default_rng(7)
L=np.zeros(N); R=np.zeros(N)
def add(sig,t,pan=0.0,g=1.0):
    i=int(t*SR); n=min(len(sig),N-i)
    if n<=0: return
    L[i:i+n]+=sig[:n]*g*(1-max(pan,0)); R[i:i+n]+=sig[:n]*g*(1+min(pan,0))
def tt(d): return np.arange(int(d*SR))/SR
def fftfilt(x,lo,hi):
    X=np.fft.rfft(x); f=np.fft.rfftfreq(len(x),1/SR); X[(f<lo)|(f>hi)]=0; return np.fft.irfft(X,len(x))
def sweep_noise(d,f0,f1,rev=False):
    n=int(d*SR); out=np.zeros(n); ch=int(0.01*SR); x=rng.standard_normal(n+ch)
    for k in range(0,n,ch):
        u=k/n; fc=f0*(f1/f0)**u
        seg=fftfilt(x[k:k+2*ch] if k+2*ch<=len(x) else np.pad(x[k:],(0,2*ch-len(x[k:]))),fc*0.5,fc*1.6)[:ch]
        out[k:k+ch]=seg[:len(out[k:k+ch])]
    return out/ (np.abs(out).max()+1e-9)
def kick():
    t=tt(0.45); f=48+110*np.exp(-t*28); ph=2*np.pi*np.cumsum(f)/SR
    s=np.sin(ph)*np.exp(-t*6.5); s+=0.35*np.exp(-t*200)*rng.standard_normal(len(t))*0.3
    return np.tanh(s*1.6)
def clap():
    t=tt(0.25); n=fftfilt(rng.standard_normal(len(t)),900,6000); env=np.zeros(len(t))
    for o in [0,0.011,0.022]: env+=np.where(t>=o,np.exp(-(t-o)*60),0)
    env+=np.exp(-t*14)*0.5*(t>0.03)
    return n/np.abs(n).max()*env*0.8
def hat(open_=False):
    t=tt(0.3 if open_ else 0.06); n=fftfilt(rng.standard_normal(len(t)),7000,16000)
    return n/np.abs(n).max()*np.exp(-t*(12 if open_ else 70))
def whoosh(d,up=True):
    s=sweep_noise(d,300 if up else 4000,4000 if up else 300); t=tt(d)[:len(s)]
    env=np.sin(np.pi*t/d)**2; return s*env
def boom():
    t=tt(1.6); f=30+70*np.exp(-t*9); s=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*2.2)
    n=fftfilt(rng.standard_normal(len(t)),60,3000)*np.exp(-t*7); n/=np.abs(n).max()
    return np.tanh(1.8*s)+0.5*n
def ping(f=1760):
    t=tt(0.6); return (np.sin(2*np.pi*f*t)+0.5*np.sin(2*np.pi*f*1.5*t)+0.25*np.sin(2*np.pi*f*2.01*t))*np.exp(-t*7)
# --- intro pad (A minor) 0-1s
t=tt(1.15); pad=sum(np.sin(2*np.pi*f*t+0.3*np.sin(2*np.pi*0.7*t)) for f in [220,261.6,329.6,440])/4
add(pad*np.minimum(t/0.3,1)*np.exp(-np.maximum(t-0.9,0)*12),0,0,0.22)
# intro ticks
for k in range(8): add(hat(),k*0.125,0.3*((-1)**k),0.18)
add(whoosh(0.4,False),0.5,-0.3,0.55)     # swipe
add(whoosh(0.25,True),0.82,0.6,0.4)      # incoming
add(ping(2637)*0.5,1.0,0.4,0.25)          # arrival thwip
# spring boing
t=tt(0.7); add(np.sin(2*np.pi*(330+120*np.exp(-t*7)*np.cos(2*np.pi*10.5/ (2*np.pi)*t*6.28))*t)*np.exp(-t*6),1.02,0.2,0.18)
# beat 1.0 - 9.0
kicks=np.arange(1.0,9.0,0.5)
for k in kicks: add(kick(),k,0,0.95)
for k in np.arange(1.5,9.0,1.0): add(clap(),k,0,0.55)
for k in np.arange(1.0,9.0,0.25): add(hat(open_=(round((k-1.0)/0.25)%2==1)),k,0.25,0.22 if round((k-1)/0.25)%2 else 0.15)
# bass with sidechain
notes=[55,55,43.65,49]
bass=np.zeros(N); tb=np.arange(N)/SR
for i,k in enumerate(np.arange(1.0,9.0,0.5)):
    f=notes[(i//2)%4]; a=int(k*SR); b=int((k+0.5)*SR); tl=tb[a:b]-k
    saw=2*((f*2*tl)%1)-1
    bass[a:b]=np.sin(2*np.pi*f*tl)*0.9+0.25*np.tanh(3*saw)
side=np.ones(N)
for k in kicks:
    a=int(k*SR); n=int(0.45*SR); side[a:a+n]=np.minimum(side[a:a+n],1-0.85*np.exp(-np.arange(n)/SR*9))
bass=fftfilt(bass,20,900)*side
L+=bass*0.42; R+=bass*0.42
# events
add(ping(1760),2.1,0.1,0.35); add(ping(2349)*0.6,2.17,-0.2,0.2)
r=whoosh(0.8,True)*np.linspace(0.3,1,len(whoosh(0.8,True))); add(r,2.15,0,0.6)
t=tt(0.8); add(np.sin(2*np.pi*np.cumsum(200+900*(t/0.8)**2)/SR)*(t/0.8)**2*0.5,2.15,0,0.25)
add(boom(),2.97,0,0.9)
add(whoosh(0.3,False),3.45,0.5,0.5)
for w,p in [(4.43,-0.6),(4.93,0.6),(5.43,-0.6),(5.92,0.6),(6.68,-0.5),(7.44,0.5)]: add(whoosh(0.16,True),w,p,0.55)
add(whoosh(0.9,True)*np.linspace(0.2,1,len(whoosh(0.9,True))),8.1,0,0.45)
add(boom(),8.98,0,1.0)
t=tt(1.0); add(sum(np.sin(2*np.pi*f*t) for f in [110,164.8,220,261.6,329.6])/5*np.exp(-t*3.5),9.0,0,0.35)
# master
mix=np.stack([L,R],1)
fade=np.ones(N); fs=int(9.8*SR); fade[fs:]=np.linspace(1,0,N-fs); mix*=fade[:,None]
mix=np.tanh(mix*1.1); mix/=np.abs(mix).max()*1.12
pcm=(mix*32767).astype(np.int16)
with wave.open(sys.argv[1],'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', len(pcm)/SR)
