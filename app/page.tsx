"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type User = { email: string; name: string; picture?: string };
type Photo = {
  id: string;
  description: string;
  lat?: number;
  lng?: number;
  source?: string;
  color: string;
  imageUrl?: string;
  driveUrl?: string;
  syncing?: boolean;
};

const seed: Photo[] = [
  { id: "P001", description: "工區上游既有水圳及周邊農耕環境", lat: 24.123456, lng: 120.123456, source: "EXIF", color: "field-a" },
  { id: "P002", description: "既有水門設施與護岸銜接處", lat: 24.123501, lng: 120.123802, source: "EXIF", color: "field-b" },
  { id: "P003", description: "下游排水渠道現況", color: "field-c" },
];

export default function Home() {
  const [photos, setPhotos] = useState(seed);
  const [selected, setSelected] = useState<Photo | null>(null);
  const [notice, setNotice] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const missing = useMemo(() => photos.filter((photo) => !photo.lat).length, [photos]);
  const syncing = photos.some((photo) => photo.syncing);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((data) => setUser(data.authenticated ? data.user : null))
      .catch(() => setNotice("無法確認 Google 登入狀態"))
      .finally(() => setAuthLoading(false));
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "success") {
      setNotice("Google 帳號已連線，可以開始上傳現勘照片");
      window.history.replaceState({}, "", "/");
    } else if (params.get("auth_error")) {
      setNotice("Google 登入未完成，請再試一次");
      window.history.replaceState({}, "", "/");
    }
  }, []);

  async function uploadPhoto(file: File, photo: Photo) {
    const form = new FormData();
    form.set("file", file);
    form.set("description", photo.description);
    if (photo.lat != null) form.set("latitude", String(photo.lat));
    if (photo.lng != null) form.set("longitude", String(photo.lng));
    try {
      const response = await fetch("/api/google/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "同步失敗");
      setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, syncing: false, driveUrl: data.file.url } : item));
      setNotice(`${photo.id} 已上傳至 Drive，並寫入 Google Sheet`);
    } catch (error) {
      setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, syncing: false } : item));
      setNotice(error instanceof Error ? error.message : "照片同步失敗");
    }
  }

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    if (!user) {
      setNotice("請先連線 Google 帳號，再上傳照片");
      return;
    }
    const additions = Array.from(files).map((file, index) => ({
      file,
      photo: {
        id: `P${String(photos.length + index + 1).padStart(3, "0")}`,
        description: file.name.replace(/\.[^.]+$/, ""),
        color: ["field-a", "field-b", "field-c"][index % 3],
        imageUrl: URL.createObjectURL(file),
        syncing: true,
      } satisfies Photo,
    }));
    setPhotos((current) => [...current, ...additions.map((item) => item.photo)]);
    setNotice(`正在同步 ${additions.length} 張照片…`);
    additions.forEach(({ file, photo }) => void uploadPhoto(file, photo));
    if (fileRef.current) fileRef.current.value = "";
  }

  function savePhoto(next: Photo) {
    setPhotos((current) => current.map((photo) => photo.id === next.id ? next : photo));
    setSelected(null);
    setNotice(`${next.id} 的本機說明與座標已更新`);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setNotice("已登出 Google 帳號");
  }

  const initial = user?.name?.trim().charAt(0) || "帳";
  return <main className="app-shell">
    <header className="topbar">
      <button className="icon-button" aria-label="返回案件列表">←</button>
      <div className="title-block"><span className="eyebrow">頂五厘制水門改建工程</span><h1>施工中現勘</h1></div>
      <button className="avatar" aria-label={user ? `帳號：${user.name}` : "連線 Google 帳號"} onClick={() => user ? void logout() : window.location.assign("/api/auth/google")}>{initial}</button>
    </header>

    {!authLoading && <section className={`account-strip ${user ? "connected" : ""}`}>
      <div><b>{user ? `${user.name} 已連線` : "尚未連線 Google"}</b><small>{user ? "照片將同步至 Drive 與 Google Sheet" : "連線後才能同步現勘照片與資料"}</small></div>
      {user ? <button onClick={() => void logout()}>登出</button> : <a href="/api/auth/google">使用 Google 登入</a>}
    </section>}

    <section className="survey-card">
      <div className="date-badge"><b>17</b><span>8月・2026</span></div>
      <div><p className="muted">現勘日期</p><h2>2026 年 8 月 17 日</h2><p>記錄施工範圍、既有水路與周邊環境現況。</p></div>
      <button className="text-button" onClick={() => setNotice("現勘說明已開啟編輯")}>編輯</button>
    </section>
    <section className="actions">
      <button className="primary" onClick={() => user ? fileRef.current?.click() : setNotice("請先連線 Google 帳號")}><span>＋</span> 拍照</button>
      <button className="secondary" onClick={() => user ? fileRef.current?.click() : setNotice("請先連線 Google 帳號")}><span>▧</span> 選取照片</button>
      <input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={(event) => addFiles(event.target.files)} />
    </section>
    {notice && <div className="notice" role="status"><span>✓</span>{notice}<button onClick={() => setNotice("")} aria-label="關閉">×</button></div>}
    <section className="photo-section">
      <div className="section-heading"><div><p className="eyebrow">現勘照片</p><h2>{photos.length} 張照片</h2></div><div className={`sync ${syncing ? "working" : ""}`}><i /> {syncing ? "同步中" : "已同步"}</div></div>
      {missing > 0 && <button className="gps-alert" onClick={() => setSelected(photos.find((photo) => !photo.lat) || null)}><span>⌖</span><div><b>{missing} 張照片尚無座標</b><small>可使用目前位置或手動補上</small></div><strong>處理 →</strong></button>}
      <div className="photo-grid">{photos.map((photo) => <article className="photo-card" key={photo.id} onClick={() => setSelected(photo)}>
        <div className={`photo-visual ${photo.color}`}>{photo.imageUrl && <img src={photo.imageUrl} alt="" />}<span>{photo.id}</span><button aria-label={`編輯 ${photo.id}`}>•••</button></div>
        <div className="photo-copy"><p>{photo.description || "尚未填寫照片說明"}</p>{photo.syncing ? <small className="syncing-label">上傳中…</small> : photo.driveUrl ? <a href={photo.driveUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>在 Drive 開啟</a> : photo.lat ? <small className="has-gps">● {photo.lat.toFixed(6)}, {photo.lng?.toFixed(6)}</small> : <small className="no-gps">○ 無座標・點擊補上</small>}</div>
      </article>)}</div>
    </section>
    <nav className="bottom-nav"><button>⌂<span>案件</span></button><button className="active">▤<span>現勘</span></button><button onClick={() => user ? void logout() : window.location.assign("/api/auth/google")}>◎<span>{user ? "登出" : "帳號"}</span></button></nav>
    {selected && <Editor photo={selected} onClose={() => setSelected(null)} onSave={savePhoto} />}
  </main>;
}

function Editor({ photo, onClose, onSave }: { photo: Photo; onClose: () => void; onSave: (photo: Photo) => void }) {
  const [draft, setDraft] = useState(photo);
  function locate() {
    navigator.geolocation?.getCurrentPosition((position) => setDraft({ ...draft, lat: position.coords.latitude, lng: position.coords.longitude, source: "DEVICE" }));
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="editor" onMouseDown={(event) => event.stopPropagation()}>
    <div className="drag" /><div className="editor-head"><div><p className="eyebrow">照片資料</p><h2>{photo.id}</h2></div><button onClick={onClose}>×</button></div>
    <div className={`editor-photo ${photo.color}`}>{photo.imageUrl && <img src={photo.imageUrl} alt="" />}<span>{photo.id}</span></div>
    <label>照片說明<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
    <div className="coordinate-head"><label>座標</label><button onClick={locate}>⌖ 使用目前位置</button></div>
    <div className="coordinates"><label>緯度<input inputMode="decimal" value={draft.lat ?? ""} placeholder="24.123456" onChange={(event) => setDraft({ ...draft, lat: Number(event.target.value), source: "MANUAL" })} /></label><label>經度<input inputMode="decimal" value={draft.lng ?? ""} placeholder="120.123456" onChange={(event) => setDraft({ ...draft, lng: Number(event.target.value), source: "MANUAL" })} /></label></div>
    <div className="meta"><span>座標來源 <b>{draft.source || "尚無座標"}</b></span><span>同步狀態 <b>{draft.driveUrl ? "Google Drive" : "範例／本機"}</b></span></div>
    <button className="save" onClick={() => onSave(draft)}>儲存修改</button>
  </section></div>;
}
