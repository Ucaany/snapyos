// Satu EXE, mode kiosk saja: satu jendela fullscreen ke halaman kiosk cloud,
// ditambah sidecar Node (runtime lokal) yang hidup selama jendela hidup.
//
// Tiga hal yang TIDAK dimiliki kiosk browser dan ditangani di sini:
// 1. Izin kamera: WebView2 menolak getUserMedia tanpa handler eksplisit.
// 2. Orientasi: tidak ada rotasi layar di Windows desktop; ukuran jendela
//    ditentukan dari `SNAPYOS_KIOSK_ORIENTATION` di bridge.env.
// 3. Ukuran jendela: resizable: false + min size dari tauri.conf.json.
//
// WebView2 tidak punya Web Bluetooth. Bluetooth hanya ada di POS, bukan di sini.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Mutex, OnceLock};

use tauri::{
    webview::{PermissionKind, PermissionResponse},
    Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_shell::{process::CommandChild, ShellExt};
use tauri_plugin_updater::UpdaterExt;

/// Sidecar hidup selama jendela hidup; disimpan supaya bisa dimatikan.
struct Sidecar(Mutex<Option<CommandChild>>);

/// Host halaman kiosk, dipakai handler izin kamera untuk memastikan hanya
/// origin dashboard yang mendapat akses kamera.
static KIOSK_HOST: OnceLock<String> = OnceLock::new();

/// Nilai dari `%ProgramData%\SNAPYOS\bridge.env` (ditulis installer, Phase 10).
/// Berkas yang sama memberi token bridge ke sidecar dan URL/orientasi ke EXE,
/// jadi tidak ada dua sumber kebenaran yang bisa berbeda.
fn install_env() -> Vec<(String, String)> {
    let path = std::env::var("SNAPYOS_BRIDGE_ENV").unwrap_or_else(|_| {
        let base = std::env::var("ProgramData").unwrap_or_else(|_| r"C:\ProgramData".into());
        format!(r"{base}\SNAPYOS\bridge.env")
    });
    let Ok(raw) = std::fs::read_to_string(&path) else {
        // Tanpa berkas ini sidecar akan menolak start (token wajib). Jangan
        // diam: operator harus tahu kenapa runtime tidak hidup.
        eprintln!("[snapyos-kiosk] {path} tidak terbaca; sidecar akan gagal start.");
        return Vec::new();
    };
    raw.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (key, value) = line.split_once('=')?;
            Some((key.trim().to_string(), value.trim().to_string()))
        })
        .collect()
}

fn env_value(env: &[(String, String)], key: &str) -> Option<String> {
    env.iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.clone())
        .filter(|v| !v.is_empty())
}

fn main() {
    let env = install_env();
    let kiosk_url = env_value(&env, "SNAPYOS_KIOSK_URL");
    let portrait = env_value(&env, "SNAPYOS_KIOSK_ORIENTATION").as_deref() == Some("portrait");

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Kamera untuk origin dashboard. Tanpa ini WebView2 menjawab
        // NotAllowedError dan petugas hanya melihat layar hitam.
        .on_permission_request(|webview, kind| {
            if kind != PermissionKind::Camera {
                return PermissionResponse::Default;
            }
            let requested = webview.url().ok().and_then(|u| u.host_str().map(str::to_string));
            match (KIOSK_HOST.get(), requested) {
                (Some(expected), Some(requested)) if *expected == requested => {
                    PermissionResponse::Allow
                }
                _ => PermissionResponse::Default,
            }
        })
        .setup(move |app| {
            let mut window_config = app
                .config()
                .app
                .windows
                .first()
                .cloned()
                .ok_or(tauri::Error::WindowNotFound)?;

            // Booth satu EXE untuk banyak lokasi: URL booth datang dari
            // bridge.env, config hanya nilai bawaan.
            if let Some(url) = kiosk_url.as_deref().and_then(|u| Url::parse(u).ok()) {
                window_config.url = WebviewUrl::External(url);
            }
            if let WebviewUrl::External(url) = &window_config.url {
                if let Some(host) = url.host_str() {
                    let _ = KIOSK_HOST.set(host.to_string());
                }
            }

            let mut window_builder = WebviewWindowBuilder::from_config(app, &window_config)?
                // Penanda untuk halaman kiosk: `window.__TAURI__` tidak selalu
                // disuntik pada origin remote, sedangkan kiosk perlu tahu kapan
                // harus melewati Screen Orientation API.
                .initialization_script("window.__SNAPYOS_EXE__ = true;");
            // Tidak ada rotasi layar di Windows desktop: `screen_orientation`
            // ditegakkan lewat ukuran jendela. Layout kiosk mengikuti viewport,
            // jadi tidak ada CSS yang perlu ditulis ulang.
            if portrait {
                window_builder = window_builder
                    .inner_size(1080.0, 1920.0)
                    .min_inner_size(768.0, 1024.0);
            }
            let window = window_builder.build()?;

            // Sidecar = runtime lokal (kamera bridge, printer, sesi offline).
            // Start sebelum jendela tampil: kiosk membaca setelan device saat
            // boot. Runtime yang tidak terpasang BUKAN alasan menolak start —
            // kamera internal tetap jalan lewat getUserMedia.
            let resource_dir = app.path().resource_dir()?;
            let script = resource_dir.join("runtime").join("main.mjs");
            if script.exists() {
                let mut command = app
                    .shell()
                    .sidecar("node")
                    .map_err(|e| tauri::Error::Anyhow(e.into()))?
                    .args(["--no-warnings".to_string(), script.to_string_lossy().into_owned()])
                    // `runtime-dist/` membawa `node_modules` sendiri; cwd harus
                    // di sana supaya `@node-rs/argon2` di-resolve.
                    .current_dir(script.parent().unwrap_or(&resource_dir));
                for (key, value) in &env {
                    command = command.env(key, value);
                }
                match command.spawn() {
                    Ok((mut events, child)) => {
                        app.manage(Sidecar(Mutex::new(Some(child))));
                        // Saluran output harus dikuras; kalau penuh, runtime
                        // berhenti menulis dan kiosk kehilangan kamera tanpa
                        // pesan apa pun.
                        tauri::async_runtime::spawn(async move {
                            use tauri_plugin_shell::process::CommandEvent;
                            while let Some(event) = events.recv().await {
                                match event {
                                    CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                                        eprintln!(
                                            "[runtime] {}",
                                            String::from_utf8_lossy(&line).trim_end()
                                        );
                                    }
                                    CommandEvent::Terminated(payload) => {
                                        eprintln!("[runtime] berhenti: {:?}", payload.code);
                                    }
                                    _ => {}
                                }
                            }
                        });
                    }
                    Err(error) => eprintln!("[snapyos-kiosk] sidecar gagal start: {error}"),
                }
            } else {
                eprintln!("[snapyos-kiosk] {} tidak ada; runtime lokal tidak dijalankan.", script.display());
                app.manage(Sidecar(Mutex::new(None)));
            }

            // Jendela tutup = booth mati. Sidecar tidak boleh tertinggal.
            let handle = app.handle().clone();
            window.on_window_event(move |event| {
                if matches!(
                    event,
                    WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
                ) {
                    if let Some(child) = handle.state::<Sidecar>().0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            });

            window.show()?;

            // Updater hanya aktif bila operator mengisi endpoint manifest.
            // Endpoint sengaja TIDAK ditulis di config: manifest rilis belum
            // punya rumah, dan endpoint kosong yang dipaksa hanya menghasilkan
            // error di log setiap boot. Pubkey sudah terpasang di config, jadi
            // begitu endpoint diisi, tanda tangannya sudah terverifikasi.
            if let Some(endpoint) = env_value(&env, "SNAPYOS_UPDATE_ENDPOINT")
                .and_then(|raw| Url::parse(&raw).ok())
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let updater = handle
                        .updater_builder()
                        .endpoints(vec![endpoint])
                        .and_then(|builder| builder.build());
                    match updater {
                        Ok(updater) => match updater.check().await {
                            Ok(Some(update)) => {
                                // Pemasangan menunggu petugas: restart booth di
                                // tengah sesi pelanggan bukan hal yang boleh
                                // terjadi otomatis.
                                eprintln!("[snapyos-kiosk] update tersedia: {}", update.version);
                            }
                            Ok(None) => {}
                            Err(error) => eprintln!("[snapyos-kiosk] cek update gagal: {error}"),
                        },
                        Err(error) => eprintln!("[snapyos-kiosk] updater tidak siap: {error}"),
                    }
                });
            }

            Ok(())
        });

    let app = builder
        .build(tauri::generate_context!())
        .expect("gagal membangun SNAPY OS Kiosk");
    app.run(|handle, event| {
        // Jaring terakhir: keluar lewat jalur selain window close tetap
        // mematikan sidecar.
        if let RunEvent::Exit = event {
            if let Some(child) = handle.state::<Sidecar>().0.lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    });
}
