from dotenv import load_dotenv

load_dotenv()

import argparse
import hashlib
import json
import os
import requests
import shutil
import tempfile
import traceback
import urllib.request
import urllib.parse
from pydub import AudioSegment
from oidc_common import OpenIDConfiguration, ClientConfiguration, get_client_state
from LoopbackServer import LoopbackServer
import time
import webbrowser
import sys
import datetime

client = ClientConfiguration(client_configuration='oidc_configuration.json',
                             client_secret=os.getenv("GOOGLE_NATIVE_APP_OIDC_CLIENT_SECRET"),
                             client_id=os.getenv("GOOGLE_NATIVE_APP_OIDC_CLIENT_ID"))

if not client.client_secret or not client.client_id:
    print("Client secret or client id is not set")
    sys.exit(1)

provider = OpenIDConfiguration('https://accounts.google.com/.well-known/openid-configuration')

MAX_AGE = 90 * 60
TOKEN_PATH = './.fomo_player_token'


def get_oauth2_token():
    if os.path.isfile(TOKEN_PATH):
        with open(TOKEN_PATH, 'r') as file:
            token = json.load(file)
            if token["expires_in"] > time.time():
                return token["id_token"]
            else:
                body = {
                    "client_id": client.client_id,
                    "client_secret": client.client_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": token["refresh_token"],
                }

                r = requests.post(provider.token_endpoint, data=body)
                token_response = r.json()
                id_token = token_response["id_token"]
                with open(TOKEN_PATH, 'w') as outfile:
                    outfile.write(
                        json.dumps({"id_token": id_token, "expires_in": time.time() + token_response["expires_in"],
                                    "refresh_token": token["refresh_token"]}))

                return id_token

    with LoopbackServer(provider, client) as httpd:
        webbrowser.open(httpd.base_uri)
        from input import start_input_thread
        start_input_thread("Press enter to stop\r\n", httpd.done)
        if httpd.wait_authorization_response() is None:
            sys.exit()

    if "error" in httpd.authorization_response:
        raise Exception(httpd.authorization_response["error"][0])

    state = get_client_state(httpd.authorization_response)

    body = {
        "grant_type": "authorization_code",
        "redirect_uri": httpd.redirect_uri,
        "code": httpd.authorization_response["code"][0],
        "code_verifier": state.code_verifier,
    }

    auth = (client.client_id, client.client_secret)

    r = requests.post(provider.token_endpoint, data=body, auth=auth)
    token_response = r.json()

    if "error" in token_response:
        raise Exception(token_response["error"])

    id_token = token_response["id_token"]
    with open(TOKEN_PATH, 'w') as outfile:
        os.chmod(TOKEN_PATH, 0o600)
        outfile.write(json.dumps({"id_token": id_token, "expires_in": time.time() + token_response["expires_in"],
                                  "refresh_token": token_response["refresh_token"]}))

    return id_token


def compute_file_hash(file_path):
    """Compute SHA256 hash of a file for comparison."""
    hash_sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_sha256.update(chunk)
    return hash_sha256.hexdigest()


def ensure_downloads_directory():
    """Ensure the downloads directory exists under analyser."""
    downloads_dir = os.path.join(os.path.dirname(__file__), 'downloads')
    os.makedirs(downloads_dir, exist_ok=True)
    return downloads_dir


def ensure_panako_db_directory():
    """Ensure the Panako database directory exists under analyser."""
    db_dir = os.path.join(os.path.dirname(__file__), 'panako_db')
    os.makedirs(db_dir, exist_ok=True)
    return os.path.abspath(db_dir)


def download_and_manage_file(url, file_id, file_type, filename=None, downloads_dir=None):
    """
    Download a file and manage duplicates.
    Returns: (file_path, needs_reprocess) where needs_reprocess is True if file matches existing and needs panako re-store
    """
    if downloads_dir is None:
        downloads_dir = ensure_downloads_directory()
    
    if filename:
        file_ext = os.path.splitext(filename)[1]
    else:
        url_path = urllib.parse.urlparse(url).path
        file_ext = os.path.splitext(url_path)[1]
        if not file_ext:
            file_ext = '.mp3'
    
    target_filename = f"{file_type}_{file_id}{file_ext}"
    target_path = os.path.join(downloads_dir, target_filename)
    
    temp_download_path = os.path.join(downloads_dir, f"{target_filename}.tmp")
    
    print(f"Downloading {file_type} with id {file_id} from: {url}")
    urllib.request.urlretrieve(url, temp_download_path)
    
    if not os.path.exists(temp_download_path):
        raise RuntimeError(f"Downloaded file does not exist: {temp_download_path}")
    
    file_size = os.path.getsize(temp_download_path)
    if file_size == 0:
        os.remove(temp_download_path)
        raise RuntimeError(f"Downloaded file is empty: {temp_download_path}")
    
    print(f"Downloaded to: {temp_download_path} (size: {file_size} bytes)")
    
    needs_reprocess = False
    
    if os.path.exists(target_path):
        print(f"File already exists: {target_path}, comparing...")
        existing_hash = compute_file_hash(target_path)
        new_hash = compute_file_hash(temp_download_path)
        
        if existing_hash == new_hash:
            print(f"Files match (hash: {existing_hash[:16]}...), will reprocess in Panako")
            os.remove(temp_download_path)
            needs_reprocess = True
            return target_path, needs_reprocess
        else:
            print(f"Files differ (existing: {existing_hash[:16]}..., new: {new_hash[:16]}...), renaming new file")
            counter = 1
            while True:
                new_filename = f"{file_type}_{file_id}_{counter}{file_ext}"
                new_path = os.path.join(downloads_dir, new_filename)
                if not os.path.exists(new_path):
                    break
                counter += 1
            os.rename(temp_download_path, new_path)
            print(f"Renamed to: {new_path}")
            return new_path, False
    else:
        os.rename(temp_download_path, target_path)
        print(f"Saved to: {target_path}")
        return target_path, False


def log_panako_call(cmd, result, command_name="Panako"):
    """Log a Panako command call with its results."""
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {command_name} command:")
    print(f"  Command: {' '.join(cmd)}")
    print(f"  Return code: {result.returncode}")
    if result.stdout:
        print(f"  Stdout: {result.stdout[:500]}{'...' if len(result.stdout) > 500 else ''}")
    if result.stderr:
        print(f"  Stderr: {result.stderr[:500]}{'...' if len(result.stderr) > 500 else ''}")


def blocks_to_seconds(t1_blocks):
    """
    Convert Panako time blocks to seconds.
    Uses Panako's default configuration values for time resolution.
    """
    # Panako default values from Key.java:
    # PANAKO_TRANSF_TIME_RESOLUTION = 2048
    # PANAKO_SAMPLE_RATE = 11025
    # Latency is typically 0 for most configurations
    time_resolution = 2048.0
    sample_rate = 11025.0
    latency = 0.0
    
    return t1_blocks * (time_resolution / sample_rate) + latency / sample_rate


def read_tdb_file(tdb_path):
    """
    Read a Panako .tdb file and extract fingerprints directly.
    Format: fingerprintHash resourceIdentifier t1 f1
    
    Returns a list of dictionaries with 'hash', 'position', and 'f1' keys.
    """
    fingerprints = []
    if not os.path.exists(tdb_path):
        return fingerprints
    
    try:
        with open(tdb_path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                parts = line.split()
                if len(parts) >= 4:
                    try:
                        hash_val = int(parts[0])
                        resource_id = int(parts[1])
                        t1_blocks = int(parts[2])
                        f1 = int(parts[3])
                        
                        # Convert t1 blocks to seconds for position
                        position = blocks_to_seconds(t1_blocks)
                        
                        fingerprint = {
                            'hash': hash_val,
                            'position': position,
                            'f1': f1
                        }
                        fingerprints.append(fingerprint)
                    except (ValueError, IndexError) as e:
                        print(f"Warning: Could not parse line in .tdb file: {line[:100]}")
                        continue
    except Exception as e:
        print(f"Warning: Error reading .tdb file {tdb_path}: {e}")
    
    return fingerprints


def extract_panako_fingerprints(audio_path):
    """
    Extract Panako fingerprints from an audio file.
    This function uses Panako's command-line interface to extract fingerprints.
    Returns a list of dictionaries with 'hash', 'position', and 'f1' keys.
    
    Note: Panako must be installed and available in PATH.
    See https://github.com/JorenSix/Panako for installation instructions.
    """
    try:
        import subprocess
        
        db_path = ensure_panako_db_directory()
        
        if not os.path.exists(db_path):
            raise RuntimeError(f"Failed to create database directory: {db_path}")
        
        audio_path_abs = os.path.abspath(audio_path)
        if not os.path.exists(audio_path_abs):
            raise RuntimeError(f"Audio file does not exist: {audio_path_abs}")
        
        # Panako configuration for FILE storage with PANAKO strategy
        panako_config_args = [
            'STRATEGY=PANAKO',           # Use Panako strategy (not OLAF)
            'PANAKO_STORAGE=FILE',       # Use file storage
            f'PANAKO_CACHE_FOLDER={db_path}'  # Store .tdb files in panako_db folder
        ]
        
        resolve_cmd = ['panako', 'resolve', audio_path_abs] + panako_config_args
        resolve_result = subprocess.run(resolve_cmd, capture_output=True, text=True, check=False)
        log_panako_call(resolve_cmd, resolve_result, "Panako resolve (check existing)")
        
        if resolve_result.returncode == 0:
            resolve_output = resolve_result.stdout.strip()
            if resolve_output:
                file_ids = [line.strip() for line in resolve_output.split('\n') if line.strip()]
                if file_ids:
                    print(f"File already exists in database with ID(s): {', '.join(file_ids)}, deleting...")
                    delete_cmd = ['panako', 'delete', audio_path_abs] + panako_config_args
                    delete_result = subprocess.run(delete_cmd, capture_output=True, text=True, check=False)
                    log_panako_call(delete_cmd, delete_result, "Panako delete")
                    if delete_result.returncode != 0:
                        print(f"Warning: Failed to delete file from database")
        
        store_cmd = ['panako', 'store', audio_path_abs, 'CHECK_DUPLICATE_FILE_NAMES=FALSE'] + panako_config_args
        store_result = subprocess.run(store_cmd, capture_output=True, text=True, check=False)
        log_panako_call(store_cmd, store_result, "Panako store")
        
        if store_result.returncode != 0:
            raise RuntimeError(f"Panako store failed: {store_result.stderr}")
        
        # Get file ID after storing
        resolve_cmd = ['panako', 'resolve', audio_path_abs] + panako_config_args
        resolve_result = subprocess.run(resolve_cmd, capture_output=True, text=True, check=False)
        log_panako_call(resolve_cmd, resolve_result, "Panako resolve (get ID)")
        
        if resolve_result.returncode != 0:
            raise RuntimeError(f"Panako resolve failed: {resolve_result.stderr}")
        
        resolve_output = resolve_result.stdout.strip()
        if not resolve_output:
            print(f"Warning: Could not resolve file ID for {audio_path}")
            return []
        
        file_ids = [line.strip() for line in resolve_output.split('\n') if line.strip()]
        if not file_ids:
            print(f"Warning: Could not parse file ID from resolve output: {resolve_output}")
            return []
        
        file_id = file_ids[0]
        
        # Read fingerprints directly from .tdb file
        # Panako FILE storage uses PANAKO_CACHE_FOLDER for .tdb files
        tdb_path = os.path.join(db_path, f"{file_id}.tdb")
        
        # Wait for .tdb file to be created (Panako writes it during processStoreQueue)
        # Give it a moment to ensure the file is written to disk
        max_retries = 20
        retry_delay = 0.1  # 100ms
        file_found = False
        for attempt in range(max_retries):
            if os.path.exists(tdb_path):
                file_size = os.path.getsize(tdb_path)
                # Check if file has content (not just created empty)
                if file_size > 0:
                    file_found = True
                    break
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
        
        if not file_found:
            # Enhanced error reporting
            if os.path.exists(tdb_path):
                file_size = os.path.getsize(tdb_path)
                print(f"Warning: .tdb file exists but is empty: {tdb_path} (size: {file_size} bytes)")
            else:
                print(f"Warning: .tdb file does not exist after {max_retries * retry_delay:.1f}s: {tdb_path}")
                print(f"  Expected location: {tdb_path}")
                print(f"  Cache folder: {db_path}")
                print(f"  File ID: {file_id}")
                # List files in cache folder for debugging
                if os.path.exists(db_path):
                    files_in_dir = os.listdir(db_path)
                    tdb_files = [f for f in files_in_dir if f.endswith('.tdb')]
                    print(f"  .tdb files in cache folder: {tdb_files[:10]}")  # Show first 10 .tdb files
                    if not tdb_files:
                        print(f"  No .tdb files found in cache folder")
                        print(f"  All files in folder: {files_in_dir[:20]}")  # Show first 20 files
                else:
                    print(f"  Cache folder does not exist: {db_path}")
            return []
        
        fingerprints = read_tdb_file(tdb_path)
        
        if not fingerprints:
            print(f"Warning: Could not parse fingerprints from .tdb file: {tdb_path}")
            return []
        
        print(f"Extracted {len(fingerprints)} fingerprints directly from .tdb file")
        return fingerprints
    except FileNotFoundError:
        error_msg = (
            "Panako command not found. Please install Panako and ensure it's in your PATH.\n"
            "See https://github.com/JorenSix/Panako for installation instructions.\n"
            "Alternatively, you can use Panako's Python bindings if available."
        )
        print(error_msg)
        raise RuntimeError(error_msg)
    except subprocess.CalledProcessError as e:
        error_msg = f"Error running Panako: {e.stderr}\nCommand: {' '.join(e.cmd) if hasattr(e, 'cmd') else 'unknown'}\nStdout: {e.stdout}"
        print(error_msg)
        raise RuntimeError(error_msg)
    except Exception as e:
        error_msg = f"Error extracting fingerprints: {e}"
        print(error_msg)
        print(traceback.format_exc())
        raise


def get_next_previews_to_fingerprint(id_token, batch_size=10):
    print("Getting next previews to fingerprint")
    res = requests.get(
        f"{os.getenv('API_URL')}/admin/exact-match/previews/without-fingerprint?limit={batch_size}",
        headers={'Authorization': f"Bearer {id_token}"}
    )
    if res.status_code != 200:
        raise Exception(f"Next previews request returned an error {res.text}")
    return res.json()


def get_next_audio_samples_to_fingerprint(id_token, batch_size=10):
    print("Getting next audio samples to fingerprint")
    res = requests.get(
        f"{os.getenv('API_URL')}/admin/exact-match/audio-samples/without-fingerprint?limit={batch_size}",
        headers={'Authorization': f"Bearer {id_token}"}
    )
    if res.status_code != 200:
        raise Exception(f"Next audio samples request returned an error {res.text}")
    return res.json()


def upload_preview_fingerprints(id_token, preview_id, fingerprints):
    data = {
        "preview_id": preview_id,
        "fingerprints": fingerprints
    }
    
    # Log upload request payload
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] Uploading preview fingerprints:")
    print(f"  Preview ID: {preview_id}")
    print(f"  Number of fingerprints: {len(fingerprints)}")
    if fingerprints:
        sample_fp = fingerprints[0]
        print(f"  Sample fingerprint: {sample_fp}")
    print(f"  Payload size: {len(json.dumps(data))} bytes")
    
    res = requests.post(
        f"{os.getenv('API_URL')}/admin/exact-match/previews/fingerprints",
        headers={'Authorization': f"Bearer {id_token}"},
        json=data
    )
    if res.status_code != 200:
        raise Exception(f"Upload fingerprints request returned an error: {res.status_code} - {res.text}")
    return res.json()


def upload_sample_fingerprints(id_token, sample_id, fingerprints):
    data = {
        "sample_id": sample_id,
        "fingerprints": fingerprints
    }
    
    # Log upload request payload
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] Uploading audio sample fingerprints:")
    print(f"  Sample ID: {sample_id}")
    print(f"  Number of fingerprints: {len(fingerprints)}")
    if fingerprints:
        sample_fp = fingerprints[0]
        print(f"  Sample fingerprint: {sample_fp}")
    print(f"  Payload size: {len(json.dumps(data))} bytes")
    
    res = requests.post(
        f"{os.getenv('API_URL')}/admin/exact-match/audio-samples/fingerprints",
        headers={'Authorization': f"Bearer {id_token}"},
        json=data
    )
    if res.status_code != 200:
        raise Exception(f"Upload fingerprints request returned an error: {res.status_code} - {res.text}")
    return res.json()


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument("-p", "--previews", action="store_true", help="Process store track previews")
    ap.add_argument("-a", "--audio-samples", action="store_true", help="Process uploaded audio samples")
    ap.add_argument("-b", "--batch-size", type=int, default=10, help="Batch size for processing")
    args = ap.parse_args()

    if not args.previews and not args.audio_samples:
        print("Please specify either --previews or --audio-samples")
        sys.exit(1)

    print(f"[{datetime.datetime.now()}] Starting Panako fingerprint extraction")
    id_token = get_oauth2_token()

    if args.audio_samples:
        samples_to_process = get_next_audio_samples_to_fingerprint(id_token, batch_size=args.batch_size)
        print(f"Got {len(samples_to_process)} audio samples")

        if len(samples_to_process) == 0:
            print("No audio samples to process")
            sys.exit(0)

        downloads_dir = ensure_downloads_directory()
        for sample in samples_to_process:
            sample_url = sample.get("url")
            sample_id = sample.get("id")
            filename = sample.get("filename")

            try:
                downloaded_path, needs_reprocess = download_and_manage_file(
                    sample_url, sample_id, "sample", filename, downloads_dir
                )
                
                file_ext_lower = os.path.splitext(downloaded_path)[1].lower()
                if file_ext_lower in ['.mp3', '.mpeg']:
                    print("Converting mp3 to wav")
                    if not os.path.exists(downloaded_path) or os.path.getsize(downloaded_path) == 0:
                        print(f"Error: MP3 file is missing or empty before conversion: {downloaded_path}")
                        continue
                    
                    sound = AudioSegment.from_mp3(downloaded_path)
                    wav_filename = os.path.join(downloads_dir, f"sample_{sample_id}.wav")
                    sound.export(wav_filename, format="wav")
                    
                    if not os.path.exists(wav_filename):
                        print(f"Error: Converted WAV file does not exist: {wav_filename}")
                        continue
                    
                    wav_size = os.path.getsize(wav_filename)
                    if wav_size == 0:
                        print(f"Error: Converted WAV file is empty: {wav_filename}")
                        continue
                    
                    print(f"Converted to WAV: {wav_filename} (size: {wav_size} bytes)")
                    audio_path = wav_filename
                elif file_ext_lower == '.wav':
                    audio_path = downloaded_path
                else:
                    print(f"Unsupported file format: {file_ext_lower}")
                    continue
                
                if not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
                    print(f"Error: Audio file is missing or empty before fingerprinting: {audio_path}")
                    continue

                if needs_reprocess:
                    print(f"File matches existing, reprocessing in Panako: {audio_path}")

                print(f"Extracting Panako fingerprints from: {audio_path}")
                fingerprints = extract_panako_fingerprints(audio_path)
                print(f"Extracted {len(fingerprints)} fingerprints")

                print(f"Uploading fingerprints for audio sample {sample_id}")
                upload_sample_fingerprints(id_token, sample_id, fingerprints)
                print(f"Successfully uploaded fingerprints for audio sample {sample_id}")

            except Exception as e:
                print(f"Error processing sample {sample_id}: {e}")
                print(traceback.format_exc())

    if args.previews:
        previews_to_process = get_next_previews_to_fingerprint(id_token, batch_size=args.batch_size)
        print(f"Got {len(previews_to_process)} previews")

        if len(previews_to_process) == 0:
            print("No previews to process")
            sys.exit(0)

        downloads_dir = ensure_downloads_directory()
        for preview in previews_to_process:
            preview_url = preview.get("url")
            preview_id = preview.get("preview_id") or preview.get("id")
            filename = preview.get("filename")

            try:
                downloaded_path, needs_reprocess = download_and_manage_file(
                    preview_url, preview_id, "preview", filename, downloads_dir
                )
                
                file_ext_lower = os.path.splitext(downloaded_path)[1].lower()
                if file_ext_lower in ['.mp3', '.mpeg']:
                    print("Converting mp3 to wav")
                    if not os.path.exists(downloaded_path) or os.path.getsize(downloaded_path) == 0:
                        print(f"Error: MP3 file is missing or empty before conversion: {downloaded_path}")
                        continue
                    
                    sound = AudioSegment.from_mp3(downloaded_path)
                    wav_filename = os.path.join(downloads_dir, f"preview_{preview_id}.wav")
                    sound.export(wav_filename, format="wav")
                    
                    if not os.path.exists(wav_filename):
                        print(f"Error: Converted WAV file does not exist: {wav_filename}")
                        continue
                    
                    wav_size = os.path.getsize(wav_filename)
                    if wav_size == 0:
                        print(f"Error: Converted WAV file is empty: {wav_filename}")
                        continue
                    
                    print(f"Converted to WAV: {wav_filename} (size: {wav_size} bytes)")
                    audio_path = wav_filename
                elif file_ext_lower == '.wav':
                    audio_path = downloaded_path
                else:
                    print(f"Unsupported file format: {file_ext_lower}")
                    continue
                
                if not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
                    print(f"Error: Audio file is missing or empty before fingerprinting: {audio_path}")
                    continue

                if needs_reprocess:
                    print(f"File matches existing, reprocessing in Panako: {audio_path}")

                print(f"Extracting Panako fingerprints from: {audio_path}")
                fingerprints = extract_panako_fingerprints(audio_path)
                print(f"Extracted {len(fingerprints)} fingerprints")

                print(f"Uploading fingerprints for preview {preview_id}")
                upload_preview_fingerprints(id_token, preview_id, fingerprints)
                print(f"Successfully uploaded fingerprints for preview {preview_id}")

            except Exception as e:
                print(f"Error processing preview {preview_id}: {e}")
                print(traceback.format_exc())

    print("Processing completed successfully")

