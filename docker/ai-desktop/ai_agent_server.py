#!/usr/bin/env python3
"""
AI Desktop Agent Server - WebSocket server for handling automation commands
"""

import asyncio
import base64
import json
import logging
import os
import random
import sys
import time
import io
import subprocess
import tempfile
import uuid
import threading
import queue
from typing import Dict, List, Any, Optional
# Disable pyautogui failsafe before import
os.environ['PYAUTOGUI_FAILSAFE'] = '0'
# Use scrot for screenshots if available
os.environ['PYAUTOGUI_SCREENSHOT_BACKEND'] = 'scrot'

# Try to import screenshot libraries
try:
    import mss
    MSS_AVAILABLE = True
except ImportError:
    MSS_AVAILABLE = False
    print("Warning: mss not available, using fallback screenshot methods")

# Try to import pyautogui with better error handling
try:
    import pyautogui
    PYAUTOGUI_AVAILABLE = True
except ImportError as e:
    print(f"Warning: pyautogui import failed: {e}")
    print("Screenshot and mouse control features will be limited")
    PYAUTOGUI_AVAILABLE = False
    # Create a mock pyautogui for basic compatibility
    class MockPyAutoGUI:
        def screenshot(self):
            return None
        def size(self):
            return (1920, 1080)
        def click(self, *args, **kwargs):
            pass
        def typewrite(self, *args, **kwargs):
            pass
        def press(self, *args, **kwargs):
            pass
        def hotkey(self, *args, **kwargs):
            pass
    pyautogui = MockPyAutoGUI()




import cv2
import numpy as np
from PIL import Image
import websockets
from websockets.server import WebSocketServerProtocol
import threading
import requests
from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import WebDriverException, TimeoutException

# Import stealth browser module for anti-detection
try:
    from stealth_browser import StealthBrowser, BrowserManager
    STEALTH_AVAILABLE = True
except ImportError:
    STEALTH_AVAILABLE = False
    logger.warning("Stealth browser module not available, using standard Selenium")

try:
    import pytesseract
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    print("Warning: pytesseract not available, OCR features disabled")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Disable PyAutoGUI failsafe for container environment
pyautogui.FAILSAFE = False

class DesktopAgentServer:
    """WebSocket server for AI desktop control"""
    
    def __init__(self, host: str = "0.0.0.0", port: int = 8080):
        self.host = host
        self.port = port
        self.clients = set()
        self.authenticated_clients = set()  # Track authenticated connections
        self.session_id = None
        self.user_id = None
        self.driver = None  # Selenium WebDriver instance
        self.chrome_devtools_url = "http://localhost:9222"
        self.terminal_process = None  # Persistent terminal process
        self.stealth_browser = None  # StealthBrowser instance for anti-detection
        self.browser_manager = BrowserManager() if STEALTH_AVAILABLE else None
        # Get VNC password from environment (set during container creation)
        self.vnc_password = os.environ.get('VNC_PASSWORD', '')
        if not self.vnc_password:
            logger.warning("⚠️ VNC_PASSWORD not set - authentication will be disabled")
        self.terminal_output = []  # Store terminal output
        
        # Configure PyAutoGUI
        pyautogui.PAUSE = 0.5  # Pause between actions
        
        # Track display recovery attempts
        self.last_recovery_attempt = 0
        self.recovery_cooldown = 60  # Minimum seconds between recovery attempts
        
        logger.info(f"AI Agent Server initialized on {host}:{port}")
    
    async def handle_client(self, websocket: WebSocketServerProtocol, path: str):
        """Handle a truly persistent WebSocket connection - enterprise grade"""
        client_id = str(uuid.uuid4())[:8]
        client_address = websocket.remote_address
        logger.info(f"[{client_id}] New persistent connection from {client_address}")
        
        # Add to clients
        self.clients.add(websocket)
        is_authenticated = False
        last_activity = time.time()
        connected_at = time.time()
        message_count = 0
        error_count = 0
        
        # CRITICAL: Disable automatic ping/pong to prevent timeouts during long operations
        websocket.ping_interval = None  # No automatic pings
        websocket.ping_timeout = None   # No ping timeouts
        websocket.max_size = 100 * 1024 * 1024  # 100MB for large screenshots
        websocket.close_timeout = 120  # 2 minutes for close handshake
        
        # Start keep-alive task for this connection
        keep_alive_task = asyncio.create_task(self._keep_alive_loop(websocket, client_id))
        
        try:
            # Main message loop - PERSISTENT
            while True:
                try:
                    # Wait for message with long timeout
                    message = await asyncio.wait_for(websocket.recv(), timeout=300.0)  # 5 minute timeout
                    
                    # Update activity
                    last_activity = time.time()
                    message_count += 1
                    
                    # Parse the message
                    data = json.loads(message)
                    
                    # Handle authentication first
                    if data.get("type") == "auth":
                        # Process authentication
                        auth_result = await self.authenticate_client(data, websocket)
                        await websocket.send(json.dumps(auth_result))
                        if auth_result.get("type") == "auth_success":
                            is_authenticated = True
                            self.authenticated_clients.add(websocket)
                        continue
                    
                    # Handle ping messages for compatibility
                    if data.get("type") == "ping":
                        last_activity = time.time()
                        try:
                            await websocket.send(json.dumps({
                                "type": "pong",
                                "timestamp": data.get("timestamp", time.time()),
                                "client_id": client_id,
                                "uptime": time.time() - connected_at,
                                "messages_processed": message_count
                            }))
                            logger.debug(f"[{client_id}] Pong sent")
                        except Exception as e:
                            logger.error(f"[{client_id}] Failed to send pong: {e}")
                            break  # Connection likely broken
                        continue
                    
                    # Check authentication for all other commands
                    if not is_authenticated:
                        try:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "data": {
                                    "error": "Authentication required",
                                    "code": "AUTH_REQUIRED"
                                }
                            }))
                        except:
                            break  # Connection broken
                        continue
                    
                    # Process command
                    last_activity = time.time()
                    command_type = data.get("data", {}).get("command", "")
                    timeout = self.get_command_timeout(command_type)
                    
                    try:
                        logger.info(f"[{client_id}] Processing command '{command_type}'")
                        response = await asyncio.wait_for(
                            self.process_message(data),
                            timeout=timeout
                        )
                        
                        # Send response
                        try:
                            await websocket.send(json.dumps(response))
                            logger.info(f"[{client_id}] Command '{command_type}' completed")
                        except Exception as send_error:
                            logger.error(f"[{client_id}] Failed to send response: {send_error}")
                            break  # Connection broken
                            
                    except asyncio.TimeoutError:
                        logger.error(f"[{client_id}] Command '{command_type}' timed out after {timeout}s")
                        try:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "data": {
                                    "error": f"Command timed out after {timeout} seconds",
                                    "command": command_type
                                }
                            }))
                        except:
                            break  # Connection broken
                            
                    except Exception as cmd_error:
                        logger.error(f"[{client_id}] Command '{command_type}' failed: {cmd_error}")
                        try:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "data": {
                                    "error": str(cmd_error),
                                    "command": command_type
                                }
                            }))
                        except:
                            break  # Connection broken
                        
                except asyncio.TimeoutError:
                    # No message in 5 minutes - check if alive
                    if websocket.closed:
                        logger.info(f"[{client_id}] Connection closed during idle")
                        break
                    # Still connected, continue waiting
                    logger.debug(f"[{client_id}] No messages for 5 minutes, connection still alive")
                    continue
                    
                except websockets.exceptions.ConnectionClosedOK:
                    logger.info(f"[{client_id}] Client closed connection gracefully")
                    break
                    
                except websockets.exceptions.ConnectionClosedError as e:
                    logger.warning(f"[{client_id}] Connection closed with error: {e.code} - {e.reason}")
                    break
                    
                except json.JSONDecodeError as e:
                    logger.error(f"[{client_id}] Invalid JSON: {e}")
                    error_count += 1
                    try:
                        await websocket.send(json.dumps({
                            "type": "error",
                            "data": {"error": f"Invalid JSON: {str(e)}"}
                        }))
                    except:
                        break  # Can't send error, connection broken
                    
                except Exception as e:
                    logger.error(f"[{client_id}] Error in message loop: {e}")
                    error_count += 1
                    
                    # Only break on too many errors
                    if error_count > 10:
                        logger.error(f"[{client_id}] Too many errors, closing connection")
                        break
                    
                    # Try to send error and continue
                    try:
                        await websocket.send(json.dumps({
                            "type": "error",
                            "data": {"error": str(e)}
                        }))
                    except:
                        break
                    
                    await asyncio.sleep(0.1)  # Brief pause before continuing
                    continue
        except Exception as e:
            logger.error(f"[{client_id}] Fatal error: {e}")
            
        finally:
            # Cancel keep-alive task
            keep_alive_task.cancel()
            try:
                await keep_alive_task
            except asyncio.CancelledError:
                pass
            
            # Clean up
            uptime = time.time() - connected_at
            logger.info(f"[{client_id}] Cleaning up (authenticated: {is_authenticated}, "
                       f"messages: {message_count}, errors: {error_count}, uptime: {uptime:.0f}s)")
            
            self.clients.discard(websocket)
            self.authenticated_clients.discard(websocket)
            
            # Close connection if still open
            if not websocket.closed:
                try:
                    await websocket.close(code=1000, reason="Session ended")
                except:
                    pass
    
    async def _keep_alive_loop(self, websocket: WebSocketServerProtocol, client_id: str):
        """Separate keep-alive loop that doesn't interfere with message processing"""
        try:
            while not websocket.closed:
                await asyncio.sleep(30)  # Check every 30 seconds
                
                if not websocket.closed:
                    try:
                        # Send WebSocket ping frame (not JSON message)
                        pong_waiter = await websocket.ping()
                        await asyncio.wait_for(pong_waiter, timeout=10)
                        logger.debug(f"[{client_id}] Keep-alive successful")
                    except asyncio.TimeoutError:
                        logger.warning(f"[{client_id}] Keep-alive timeout")
                        # Don't break - let main handler deal with it
                    except Exception as e:
                        logger.debug(f"[{client_id}] Keep-alive error: {e}")
                        break
        except asyncio.CancelledError:
            logger.debug(f"[{client_id}] Keep-alive loop cancelled")
            raise
    
    def get_command_timeout(self, command: str) -> float:
        """Get appropriate timeout for different commands with buffer"""
        # Long operations - add buffer for network latency
        if command in ["browser_get_dom", "browser_get_context", "browser_get_clickables", "detect_elements", "ocr"]:
            return 75.0  # Increased for reliability
        elif command in ["browser_navigate", "browser_open", "browser_connect"]:
            return 60.0  # Navigation can be slow
        # Medium operations
        elif command in ["screenshot", "execute_command", "terminal_execute"]:
            return 45.0  # Increased buffer
        # Quick operations
        else:
            return 30.0  # Default with good buffer
    
    
    async def authenticate_client(self, data: Dict[str, Any], websocket: WebSocketServerProtocol) -> Dict[str, Any]:
        """Authenticate a WebSocket client with password verification"""
        provided_password = data.get('password', '')
        session_id = data.get('sessionId')
        user_id = data.get('userId')
        
        # If no password is set (development mode), allow any connection
        if not self.vnc_password:
            logger.warning("⚠️ No password set - accepting connection (INSECURE)")
            self.session_id = session_id
            self.user_id = user_id
            return {
                "type": "auth_success",
                "data": {
                    "message": "Authentication successful (no password mode)",
                    "sessionId": session_id,
                    "userId": user_id
                }
            }
        
        # Verify password
        if provided_password != self.vnc_password:
            logger.error(f"❌ Authentication failed for session {session_id} - invalid password")
            return {
                "type": "auth_error",
                "data": {
                    "error": "Invalid password",
                    "code": "INVALID_PASSWORD"
                }
            }
        
        # Authentication successful
        self.session_id = session_id
        self.user_id = user_id
        logger.info(f"✓ Authenticated session: {session_id} for user: {user_id}")
        return {
            "type": "auth_success",
            "data": {
                "message": "Authentication successful - persistent connection established",
                "sessionId": session_id,
                "userId": user_id,
                "persistent": True  # Indicate persistent connection
            }
        }
    
    async def process_message(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Process incoming WebSocket message (for authenticated clients)"""
        msg_type = data.get('type')
        
        # Auth is handled separately in handle_client
        if msg_type == 'auth':
            return {
                "type": "error",
                "data": {"error": "Authentication should be handled in handle_client"}
            }
        
        elif msg_type == 'command':
            # Handle command execution
            command_data = data.get('data', {})
            command = command_data.get('command')
            parameters = command_data.get('parameters', {})
            
            logger.info(f"Executing command: {command}")
            result = await self.execute_command(command, parameters)
            
            return {
                "type": "result",
                "data": result
            }
        
        elif msg_type == 'ping':
            return {
                "type": "pong", 
                "data": {
                    "timestamp": data.get('timestamp', time.time()),
                    "agent_status": "ready",
                    "uptime": time.time()  # Could track actual uptime if needed
                }
            }
        
        else:
            return {
                "type": "error",
                "data": {"error": f"Unknown message type: {msg_type}"}
            }
    
    async def execute_command(self, command: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a desktop automation command"""
        try:
            # Screenshot commands
            if command == "screenshot":
                screenshot = self.take_screenshot()
                return {
                    "success": True,
                    "screenshot": screenshot,
                    "timestamp": time.time()
                }
            
            # Mouse commands
            elif command == "click":
                x = parameters.get('x', pyautogui.position()[0])
                y = parameters.get('y', pyautogui.position()[1])
                button = parameters.get('button', 'left')
                clicks = parameters.get('clicks', 1)
                
                pyautogui.click(x, y, clicks=clicks, button=button)
                time.sleep(0.5)  # Wait for action to complete
                
                return {
                    "success": True,
                    "action": "Successfuly clicked",
                    "position": {"x": x, "y": y}
                }
            
            elif command == "double_click":
                x = parameters.get('x', pyautogui.position()[0])
                y = parameters.get('y', pyautogui.position()[1])
                
                pyautogui.doubleClick(x, y)
                time.sleep(0.5)
                
                return {
                    "success": True,
                    "action": "Successfully double clicked",
                    "position": {"x": x, "y": y}
                }
            
            elif command == "right_click":
                x = parameters.get('x', pyautogui.position()[0])
                y = parameters.get('y', pyautogui.position()[1])
                
                pyautogui.rightClick(x, y)
                time.sleep(0.5)
                
                return {
                    "success": True,
                    "action": "Successfully right clicked",
                    "position": {"x": x, "y": y}
                }
            
            # Keyboard commands
            elif command == "type":
                text = parameters.get('text', '')
                interval = parameters.get('interval', 0.1)
                
                pyautogui.typewrite(text, interval=interval)
                time.sleep(0.5)
                
                return {
                    "success": True,
                    "action": "Successfully typed",
                    "text": text
                }
            
            elif command == "key_press":
                keys = parameters.get('keys', [])
                if isinstance(keys, str):
                    keys = [keys]
                
                for key in keys:
                    pyautogui.press(key)
                    time.sleep(0.1)
                
                time.sleep(0.5)
                
                return {
                    "success": True,
                    "action": "Successfully pressed",
                    "keys": keys
                }
            
            elif command == "key_combo":
                keys = parameters.get('keys', [])
                
                pyautogui.hotkey(*keys)
                time.sleep(0.5)
                
                return {
                    "success": True,
                    "action": "Successfully pressed",
                    "keys": keys
                }
            
            # Terminal command
            elif command == "open_terminal":
                # Open terminal using Ctrl+Alt+T
                pyautogui.hotkey('ctrl', 'alt', 't')
                time.sleep(2)  # Wait for terminal to open
                
                return {
                    "success": True,
                    "action": "Successfully opened terminal"
                }
            
            # Window management
            elif command == "list_windows":
                # List all open windows using wmctrl
                result = await self.list_windows()
                return result
            
            elif command == "switch_window":
                # Switch to a specific window by title or index
                window_identifier = parameters.get('window', '')
                result = await self.switch_to_window(window_identifier)
                return result
            
            elif command == "arrange_windows":
                # Arrange windows (tile, cascade, etc.)
                arrangement = parameters.get('arrangement', 'tile')
                result = await self.arrange_windows(arrangement)
                return result
            
            elif command == "close_window":
                # Close current or specific window by title or ID
                window_identifier = parameters.get('window_title', parameters.get('window_id', None))
                if window_identifier:
                    # Try to close by ID first (if it looks like a hex ID)
                    if window_identifier.startswith('0x') or window_identifier.isdigit():
                        # Close by window ID
                        result = os.system(f"wmctrl -i -c {window_identifier} 2>/dev/null")
                        if result != 0:
                            # If ID didn't work, try as title
                            os.system(f"wmctrl -c '{window_identifier}' 2>/dev/null || true")
                    else:
                        # Close by title (partial match supported)
                        os.system(f"wmctrl -c '{window_identifier}' 2>/dev/null || true")
                else:
                    # Close current window
                    pyautogui.hotkey('alt', 'f4')
                
                time.sleep(0.5)
                
                return {
                    "success": True,
                    "action": "close_window",
                    "window": window_identifier or "current"
                }
            
            elif command == "minimize_window":
                # Minimize window by title or ID
                window_identifier = parameters.get('window_title', parameters.get('window_id', None))
                if window_identifier:
                    # Try by ID first if it looks like one
                    if window_identifier.startswith('0x') or window_identifier.isdigit():
                        # Minimize by window ID
                        result = os.system(f"wmctrl -i -r {window_identifier} -b add,hidden 2>/dev/null")
                        if result != 0:
                            # If ID didn't work, try as title
                            os.system(f"wmctrl -r '{window_identifier}' -b add,hidden 2>/dev/null || true")
                    else:
                        # Minimize by title
                        os.system(f"wmctrl -r '{window_identifier}' -b add,hidden 2>/dev/null || true")
                else:
                    # Minimize current window
                    pyautogui.hotkey('alt', 'f9')
                
                time.sleep(0.5)
                
                return {
                    "success": True,
                    "action": "minimize_window",
                    "window": window_identifier or "current"
                }
            
            elif command == "maximize_window":
                # Maximize window by title or ID
                window_identifier = parameters.get('window_title', parameters.get('window_id', None))
                if window_identifier:
                    # Try by ID first if it looks like one
                    if window_identifier.startswith('0x') or window_identifier.isdigit():
                        # Maximize by window ID
                        result = os.system(f"wmctrl -i -r {window_identifier} -b add,maximized_vert,maximized_horz 2>/dev/null")
                        if result != 0:
                            # If ID didn't work, try as title
                            os.system(f"wmctrl -r '{window_identifier}' -b add,maximized_vert,maximized_horz 2>/dev/null || true")
                    else:
                        # Maximize by title
                        os.system(f"wmctrl -r '{window_identifier}' -b add,maximized_vert,maximized_horz 2>/dev/null || true")
                else:
                    # Maximize current window
                    pyautogui.hotkey('alt', 'f10')
                
                time.sleep(0.5)
                
                return {
                    "success": True,
                    "action": "maximize_window",
                    "window": window_identifier or "current"
                }
            
            elif command == "restore_window":
                # Restore window by title or ID
                window_identifier = parameters.get('window_title', parameters.get('window_id', None))
                if window_identifier:
                    # Try by ID first if it looks like one
                    if window_identifier.startswith('0x') or window_identifier.isdigit():
                        # Restore by window ID
                        result1 = os.system(f"wmctrl -i -r {window_identifier} -b remove,hidden 2>/dev/null")
                        result2 = os.system(f"wmctrl -i -r {window_identifier} -b remove,maximized_vert,maximized_horz 2>/dev/null")
                        if result1 != 0 and result2 != 0:
                            # If ID didn't work, try as title
                            os.system(f"wmctrl -r '{window_identifier}' -b remove,hidden 2>/dev/null || true")
                            os.system(f"wmctrl -r '{window_identifier}' -b remove,maximized_vert,maximized_horz 2>/dev/null || true")
                    else:
                        # Restore by title
                        os.system(f"wmctrl -r '{window_identifier}' -b remove,hidden 2>/dev/null || true")
                        os.system(f"wmctrl -r '{window_identifier}' -b remove,maximized_vert,maximized_horz 2>/dev/null || true")
                else:
                    # Restore current window (unmaximize)
                    pyautogui.hotkey('alt', 'f5')
                
                time.sleep(0.5)
                
                return {
                    "success": True,
                    "action": "restore_window",
                    "window": window_identifier or "current"
                }
            
            elif command == "move_window":
                # Move window to specific position by title or ID
                x = parameters.get('x', 100)
                y = parameters.get('y', 100)
                width = parameters.get('width', None)
                height = parameters.get('height', None)
                window_identifier = parameters.get('window_title', parameters.get('window_id', None))
                
                if window_identifier:
                    # Prepare the size parameters
                    if width and height:
                        size_params = f"0,{x},{y},{width},{height}"
                    else:
                        size_params = f"0,{x},{y},-1,-1"
                    
                    # Try by ID first if it looks like one
                    if window_identifier.startswith('0x') or window_identifier.isdigit():
                        # Move by window ID
                        result = os.system(f"wmctrl -i -r {window_identifier} -e {size_params} 2>/dev/null")
                        if result != 0:
                            # If ID didn't work, try as title
                            os.system(f"wmctrl -r '{window_identifier}' -e {size_params} 2>/dev/null || true")
                    else:
                        # Move by title
                        os.system(f"wmctrl -r '{window_identifier}' -e {size_params} 2>/dev/null || true")
                else:
                    # Move current window using keyboard
                    pyautogui.hotkey('alt', 'f7')  # Start move
                    time.sleep(0.5)
                    pyautogui.moveTo(x, y)
                    pyautogui.click()
                
                time.sleep(0.5)
                
                return {
                    "success": True,
                    "action": "move_window",
                    "position": {"x": x, "y": y, "width": width, "height": height},
                    "window": window_identifier or "current"
                }
            
            # OCR command
            elif command == "ocr" and OCR_AVAILABLE:
                screenshot = self.take_screenshot(raw=True)
                text = pytesseract.image_to_string(screenshot)
                
                return {
                    "success": True,
                    "action": "Successfully ocr'd",
                    "text": text
                }
            
            # Element detection command
            elif command == "detect_elements":
                result = await self.detect_all_elements(parameters)
                return result
            
            # Browser automation commands
            elif command == "browser_open":
                result = await self.browser_open_and_connect()
                return result
            
            elif command == "browser_connect":
                result = await self.connect_to_browser()
                return result
            
            elif command == "browser_get_dom":
                result = await self.get_browser_dom_elements()
                return result
            
            elif command == "browser_get_clickables":
                result = await self.browser_get_clickables()
                return result
            
            elif command == "browser_click":
                selector = parameters.get('selector', '')
                result = await self.browser_click_element(selector)
                return result
            
            elif command == "browser_type":
                selector = parameters.get('selector', '')
                text = parameters.get('text', '')
                result = await self.browser_type_in_element(selector, text)
                return result
            
            elif command == "browser_execute":
                script = parameters.get('script', '')
                result = await self.browser_execute_script(script)
                return result
            
            elif command == "browser_scroll":
                direction = parameters.get('direction', 'down')
                amount = parameters.get('amount', 500)
                result = await self.browser_scroll_page(direction, amount)
                return result
            
            elif command == "browser_wait":
                selector = parameters.get('selector', None)
                timeout = parameters.get('timeout', 30)
                # Convert milliseconds to seconds if needed
                if timeout > 1000:
                    timeout = timeout / 1000
                result = await self.browser_wait_for_page_load(selector, int(timeout))
                return result
            
            elif command == "browser_navigate":
                url = parameters.get('url', '')
                result = await self.browser_navigate_to(url)
                return result
            
            elif command == "browser_list_tabs":
                result = await self.browser_list_tabs()
                return result
            
            elif command == "browser_open_tab":
                url = parameters.get('url', None)
                result = await self.browser_open_tab(url)
                return result
            
            elif command == "browser_close_tab":
                tab_index = parameters.get('tab_index', None)
                result = await self.browser_close_tab(tab_index)
                return result
            
            elif command == "browser_switch_tab":
                tab_index = parameters.get('tab_index', 0)
                result = await self.browser_switch_tab(tab_index)
                return result
            
            elif command == "browser_info":
                result = await self.get_browser_info()
                return result
            
            elif command == "browser_state":
                """Get comprehensive browser state including focus, cursor, and page changes"""
                result = await self.get_browser_state()
                return result
            
            elif command == "browser_get_context":
                """Get AI-friendly context about current page and interaction state"""
                result = await self.get_browser_context()
                return result
            
            # Terminal management commands - more intuitive like browser
            elif command == "terminal_connect":
                """Connect to existing terminal session or create new one"""
                return await self.terminal_connect()
            
            elif command == "terminal_execute":
                """Execute command in terminal and get output"""
                cmd = parameters.get('command', '')
                wait_for_output = parameters.get('wait_for_output', True)
                timeout = parameters.get('timeout', 5)
                return await self.terminal_execute(cmd, wait_for_output, timeout)
            
            elif command == "terminal_type":
                """Type text in terminal (without executing)"""
                text = parameters.get('text', '')
                return await self.terminal_type(text)
            
            elif command == "terminal_read":
                """Read current output from terminal"""
                return await self.terminal_read()
            
            elif command == "terminal_clear":
                """Clear terminal screen"""
                return await self.terminal_clear()
            
            elif command == "terminal_close":
                """Close terminal session"""
                return await self.terminal_close()
            
            # File operations - standardized and reliable
            elif command == "file_read":
                """Read file contents reliably"""
                return await self.file_read(parameters)
            
            elif command == "file_write":
                """Write/create file with content"""
                return await self.file_write(parameters)
            
            elif command == "file_edit":
                """Edit file by replacing specific content"""
                return await self.file_edit(parameters)
            
            elif command == "file_append":
                """Append content to file"""
                return await self.file_append(parameters)
            
            elif command == "file_delete":
                """Delete a file"""
                return await self.file_delete(parameters)
            
            elif command == "file_exists":
                """Check if file exists"""
                return await self.file_exists(parameters)
            
            elif command == "directory_list":
                """List all files and directories in a directory"""
                return await self.directory_list(parameters)
            
            elif command == "directory_delete":
                """Delete a directory and all its contents"""
                return await self.directory_delete(parameters)
            
            # File transfer commands
            elif command == "file_upload":
                """Upload a file from client to container"""
                return await self.file_upload(parameters)
            
            elif command == "file_download":
                """Download a file from container to client"""
                return await self.file_download(parameters)
            
            elif command == "file_list_downloads":
                """List available files for download"""
                return await self.file_list_downloads(parameters)
            
            # Legacy command execution (deprecated)
            elif command == "execute_command":
                cmd = parameters.get('command', '')
                
                # Open terminal and execute command
                pyautogui.hotkey('ctrl', 'alt', 't')
                time.sleep(1)
                pyautogui.typewrite(cmd)
                pyautogui.press('enter')
                time.sleep(2)
                
                return {
                    "success": True,
                    "action": "execute_command",
                    "command": cmd
                }
            
            else:
                return {
                    "success": False,
                    "error": f"Unknown command: {command}"
                }
                
        except Exception as e:
            logger.error(f"Error executing command {command}: {e}")
            return {
                "success": False,
                "error": str(e),
                "command": command,
                "parameters": parameters
            }
    
    def take_screenshot(self, raw: bool = False) -> Any:
        """Take a screenshot of the desktop using multiple methods with auto-recovery"""
        screenshot = None
        retry_with_recovery = False
        
        # Method 1: Try mss (fastest and most reliable)
        if MSS_AVAILABLE:
            try:
                with mss.mss() as sct:
                    # Capture the primary monitor
                    monitor = sct.monitors[1]  # Monitor 1 is the primary display
                    sct_img = sct.grab(monitor)
                    # Convert to PIL Image
                    from PIL import Image
                    screenshot = Image.frombytes('RGB', sct_img.size, sct_img.bgra, 'raw', 'BGRX')
                    logger.info("Screenshot taken with mss")
            except Exception as e:
                logger.warning(f"mss screenshot failed: {e}")
                if "cannot connect to X server" in str(e).lower() or "bad x server" in str(e).lower():
                    retry_with_recovery = True
        
        # Method 2: Try pyautogui
        if screenshot is None and PYAUTOGUI_AVAILABLE:
            try:
                screenshot = pyautogui.screenshot()
                if screenshot:
                    logger.info("Screenshot taken with pyautogui")
            except Exception as e:
                logger.warning(f"pyautogui screenshot failed: {e}")
                if "cannot connect to X server" in str(e).lower() or "xauthority" in str(e).lower():
                    retry_with_recovery = True
        
        # Method 3: Try scrot command directly
        if screenshot is None:
            try:
                import subprocess
                import tempfile
                from PIL import Image
                
                with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                    tmp_path = tmp.name
                
                # Use scrot to capture screenshot
                result = subprocess.run(
                    ['scrot', tmp_path],
                    capture_output=True,
                    timeout=5,
                    env={**os.environ, 'DISPLAY': ':1', 'XAUTHORITY': '/home/desktop/.Xauthority'}
                )
                
                if result.returncode == 0:
                    screenshot = Image.open(tmp_path)
                    logger.info("Screenshot taken with scrot")
                    os.unlink(tmp_path)
                else:
                    error_msg = result.stderr.decode()
                    logger.warning(f"scrot failed: {error_msg}")
                    if "MIT-MAGIC-COOKIE" in error_msg or "cannot open display" in error_msg:
                        retry_with_recovery = True
                    
            except Exception as e:
                logger.warning(f"scrot screenshot failed: {e}")
        
        # Method 4: Try import command (ImageMagick)
        if screenshot is None:
            try:
                import subprocess
                import tempfile
                from PIL import Image
                
                with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                    tmp_path = tmp.name
                
                # Use import to capture screenshot
                result = subprocess.run(
                    ['import', '-window', 'root', tmp_path],
                    capture_output=True,
                    timeout=5,
                    env={**os.environ, 'DISPLAY': ':1', 'XAUTHORITY': '/home/desktop/.Xauthority'}
                )
                
                if result.returncode == 0:
                    screenshot = Image.open(tmp_path)
                    logger.info("Screenshot taken with ImageMagick import")
                    os.unlink(tmp_path)
                    
            except Exception as e:
                logger.warning(f"ImageMagick screenshot failed: {e}")
        
        # If all methods failed and we detected an X server issue, try recovery
        if screenshot is None and retry_with_recovery:
            logger.warning("Detected X server/authentication issue, attempting display recovery...")
            if self.recover_display():
                # Try screenshot again after recovery
                logger.info("Retrying screenshot after display recovery...")
                return self.take_screenshot(raw=raw)
        
        if screenshot is None:
            logger.error("All screenshot methods failed")
            return None
        
        if raw:
            return screenshot
        
        # Convert to base64
        return self.image_to_base64(screenshot)
    
    def image_to_base64(self, image: Image.Image) -> str:
        """Convert PIL Image to base64 string"""
        buffered = io.BytesIO()
        image.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
        return f"data:image/png;base64,{img_str}"
    
    def recover_display(self) -> bool:
        """Attempt to recover the display environment when X server issues are detected"""
        import subprocess
        
        # Check if enough time has passed since last recovery attempt
        current_time = time.time()
        if current_time - self.last_recovery_attempt < self.recovery_cooldown:
            logger.info(f"Skipping display recovery (cooldown: {self.recovery_cooldown}s)")
            return False
        
        self.last_recovery_attempt = current_time
        logger.warning("Attempting display recovery...")
        
        try:
            # First, try to regenerate X authority only
            logger.info("Step 1: Regenerating X authority...")
            result = subprocess.run(
                ['/opt/.system/display_recovery.sh', 'regenerate-auth'],
                capture_output=True,
                timeout=10
            )
            
            if result.returncode == 0:
                logger.info("X authority regenerated successfully")
                
                # Test if display works now
                test_result = subprocess.run(
                    ['xset', 'q'],
                    capture_output=True,
                    timeout=5,
                    env={**os.environ, 'DISPLAY': ':1', 'XAUTHORITY': '/home/desktop/.Xauthority'}
                )
                
                if test_result.returncode == 0:
                    logger.info("Display is working after X authority regeneration")
                    # Update environment variables
                    os.environ['XAUTHORITY'] = '/home/desktop/.Xauthority'
                    return True
            
            # If that didn't work, try full display recovery
            logger.warning("Step 2: Attempting full display recovery...")
            result = subprocess.run(
                ['/opt/.system/display_recovery.sh', 'recover'],
                capture_output=True,
                timeout=30
            )
            
            if result.returncode == 0:
                logger.info("Display recovery completed successfully")
                # Update environment variables
                os.environ['XAUTHORITY'] = '/home/desktop/.Xauthority'
                os.environ['DISPLAY'] = ':1'
                
                # Re-initialize pyautogui if available
                if PYAUTOGUI_AVAILABLE:
                    try:
                        # Force pyautogui to reconnect to display
                        import importlib
                        importlib.reload(pyautogui)
                        pyautogui.FAILSAFE = False
                        pyautogui.PAUSE = 0.5
                        logger.info("PyAutoGUI reinitialized after display recovery")
                    except Exception as e:
                        logger.warning(f"Failed to reinitialize PyAutoGUI: {e}")
                
                return True
            else:
                logger.error(f"Display recovery failed: {result.stderr.decode()}")
                return False
                
        except subprocess.TimeoutExpired:
            logger.error("Display recovery timed out")
            return False
        except FileNotFoundError:
            logger.error("Display recovery script not found at /opt/.system/display_recovery.sh")
            return False
        except Exception as e:
            logger.error(f"Display recovery error: {e}")
            return False
    
    async def detect_all_elements(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Detect all UI elements on the screen and return their coordinates"""
        try:
            # Take screenshot but don't return it
            screenshot = self.take_screenshot(raw=True)
            if screenshot is None:
                return {
                    "success": False,
                    "error": "Failed to capture screenshot",
                    "elements": [],
                    "element_count": 0
                }
            
            # Convert PIL Image to numpy array for OpenCV processing
            screenshot_np = np.array(screenshot)
            screenshot_rgb = cv2.cvtColor(screenshot_np, cv2.COLOR_RGB2BGR)
            
            # Collect elements from different detection methods
            all_detections = []
            
            # 1. Detect text regions using OCR (highest priority)
            if OCR_AVAILABLE and parameters.get('include_text', True):
                text_elements = self.detect_text_regions(screenshot, parameters)
                for elem in text_elements:
                    elem['detection_method'] = 'ocr'
                    elem['priority'] = 3  # Highest priority
                    all_detections.append(elem)
            
            # 2. Detect clickable areas (medium priority)
            if parameters.get('include_clickable', True):
                clickable_elements = self.detect_clickable_areas(screenshot_rgb)
                for elem in clickable_elements:
                    elem['detection_method'] = 'color'
                    elem['priority'] = 2
                    all_detections.append(elem)
            
            # 3. Detect UI elements using contour detection (lowest priority)
            if parameters.get('include_ui', True):
                ui_elements = self.detect_ui_elements(screenshot_rgb)
                for elem in ui_elements:
                    elem['detection_method'] = 'contour'
                    elem['priority'] = 1
                    all_detections.append(elem)
            
            # Merge overlapping elements and remove duplicates
            merged_elements = self.merge_overlapping_elements(all_detections)
            
            # Assign unique IDs
            for i, elem in enumerate(merged_elements, 1):
                # Create ID based on primary detection method and type
                method = elem.get('detection_method', 'unknown')
                elem_type = elem.get('type', 'element')
                elem['id'] = f"{method}_{elem_type}_{i}"
                
                # Remove internal fields
                elem.pop('detection_method', None)
                elem.pop('priority', None)
            
            # Sort elements by position (top to bottom, left to right)
            merged_elements.sort(key=lambda e: (
                e.get('coordinates', {}).get('y', 0),
                e.get('coordinates', {}).get('x', 0)
            ))
            
            # Get screen resolution
            screen_width, screen_height = 1920, 1080  # Default to 1920x1080
            try:
                if PYAUTOGUI_AVAILABLE:
                    screen_width, screen_height = pyautogui.size()
            except Exception:
                pass
            
            return {
                "success": True,
                "elements": merged_elements,
                "screen_resolution": {
                    "width": screen_width,
                    "height": screen_height
                },
                "element_count": len(merged_elements),
                "timestamp": time.time(),
                "message": f"Detected {len(merged_elements)} unique elements on screen"
            }
            
        except Exception as e:
            logger.error(f"Error detecting elements: {e}")
            return {
                "success": False,
                "error": str(e),
                "elements": [],
                "element_count": 0
            }
    
    def merge_overlapping_elements(self, elements: list) -> list:
        """Merge overlapping elements, keeping the highest priority one"""
        if not elements:
            return []
        
        # Sort by priority (highest first)
        elements.sort(key=lambda e: e.get('priority', 0), reverse=True)
        
        merged = []
        used_indices = set()
        
        for i, elem1 in enumerate(elements):
            if i in used_indices:
                continue
            
            # Check for overlaps with other elements
            overlapping = [elem1]
            coords1 = elem1.get('coordinates', {})
            
            for j, elem2 in enumerate(elements[i+1:], i+1):
                if j in used_indices:
                    continue
                
                coords2 = elem2.get('coordinates', {})
                
                # Check if elements overlap
                if self.elements_overlap(coords1, coords2):
                    overlapping.append(elem2)
                    used_indices.add(j)
            
            # Merge overlapping elements
            merged_elem = self.merge_element_group(overlapping)
            merged.append(merged_elem)
            used_indices.add(i)
        
        return merged
    
    def elements_overlap(self, coords1: dict, coords2: dict, threshold: float = 0.5) -> bool:
        """Check if two elements overlap by more than threshold percentage"""
        x1, y1, w1, h1 = coords1.get('x', 0), coords1.get('y', 0), coords1.get('width', 0), coords1.get('height', 0)
        x2, y2, w2, h2 = coords2.get('x', 0), coords2.get('y', 0), coords2.get('width', 0), coords2.get('height', 0)
        
        # Calculate intersection
        x_overlap = max(0, min(x1 + w1, x2 + w2) - max(x1, x2))
        y_overlap = max(0, min(y1 + h1, y2 + h2) - max(y1, y2))
        
        if x_overlap == 0 or y_overlap == 0:
            return False
        
        intersection_area = x_overlap * y_overlap
        area1 = w1 * h1
        area2 = w2 * h2
        
        # Check if intersection is significant for either element
        if area1 > 0 and area2 > 0:
            overlap_ratio = max(intersection_area / area1, intersection_area / area2)
            return overlap_ratio > threshold
        
        return False
    
    def merge_element_group(self, elements: list) -> dict:
        """Merge a group of overlapping elements into one"""
        if not elements:
            return {}
        
        if len(elements) == 1:
            return elements[0].copy()
        
        # Start with the highest priority element
        merged = elements[0].copy()
        
        # Combine information from all elements
        all_texts = []
        all_types = []
        max_confidence = merged.get('confidence', 0.5)
        
        for elem in elements:
            # Collect texts
            if 'text' in elem and elem['text']:
                all_texts.append(elem['text'])
            
            # Collect types
            elem_type = elem.get('type', 'element')
            if elem_type not in all_types:
                all_types.append(elem_type)
            
            # Track maximum confidence
            if 'confidence' in elem:
                max_confidence = max(max_confidence, elem['confidence'])
        
        # Update merged element
        if all_texts:
            # Use the longest text or the one from highest priority
            merged['text'] = max(all_texts, key=len)
        
        # Determine best type
        if 'button' in all_types or 'primary_button' in all_types or 'secondary_button' in all_types:
            merged['type'] = 'button'
        elif 'input_field' in all_types:
            merged['type'] = 'input_field'
        elif 'link' in all_types:
            merged['type'] = 'link'
        elif all_types:
            # Use type from highest priority element
            merged['type'] = elements[0].get('type', 'element')
        
        # Use the best confidence score
        merged['confidence'] = max_confidence
        
        # Calculate union bounding box
        all_coords = [elem.get('coordinates', {}) for elem in elements]
        if all_coords:
            min_x = min(c.get('x', 0) for c in all_coords)
            min_y = min(c.get('y', 0) for c in all_coords)
            max_x = max(c.get('x', 0) + c.get('width', 0) for c in all_coords)
            max_y = max(c.get('y', 0) + c.get('height', 0) for c in all_coords)
            
            merged['coordinates'] = {
                'x': min_x,
                'y': min_y,
                'width': max_x - min_x,
                'height': max_y - min_y
            }
            merged['center'] = {
                'x': min_x + (max_x - min_x) // 2,
                'y': min_y + (max_y - min_y) // 2
            }
        
        return merged
    
    def preprocess_for_ocr(self, image: Image.Image) -> Image.Image:
        """Preprocess image for better OCR accuracy"""
        try:
            # Convert PIL Image to numpy array
            img_array = np.array(image)
            
            # Convert to grayscale if not already
            if len(img_array.shape) == 3:
                gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            else:
                gray = img_array
            
            # Apply multiple preprocessing techniques
            # 1. Denoise
            denoised = cv2.fastNlMeansDenoising(gray)
            
            # 2. Increase contrast using CLAHE
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
            enhanced = clahe.apply(denoised)
            
            # 3. Apply adaptive thresholding for better text extraction
            thresh = cv2.adaptiveThreshold(enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                         cv2.THRESH_BINARY, 11, 2)
            
            # 4. Apply slight dilation to connect broken text
            kernel = np.ones((1,1), np.uint8)
            processed = cv2.dilate(thresh, kernel, iterations=1)
            
            # 5. Sharpen the image
            kernel_sharpen = np.array([[-1,-1,-1],
                                      [-1, 9,-1],
                                      [-1,-1,-1]])
            sharpened = cv2.filter2D(processed, -1, kernel_sharpen)
            
            # Convert back to PIL Image
            return Image.fromarray(sharpened)
            
        except Exception as e:
            logger.warning(f"Preprocessing failed, using original image: {e}")
            return image
    
    def detect_text_multi_scale(self, screenshot: Image.Image) -> list:
        """Perform multi-scale text detection for better coverage"""
        additional_elements = []
        
        try:
            # Try different preprocessing approaches
            scales = [1.5, 2.0, 0.75]  # Different scales for detection
            
            for scale in scales:
                # Resize image
                width = int(screenshot.width * scale)
                height = int(screenshot.height * scale)
                resized = screenshot.resize((width, height), Image.LANCZOS)
                
                # Apply different preprocessing
                if scale > 1:
                    # For upscaled images, apply sharpening
                    img_array = np.array(resized)
                    kernel = np.array([[0, -1, 0],
                                      [-1, 5, -1],
                                      [0, -1, 0]])
                    sharpened = cv2.filter2D(img_array, -1, kernel)
                    processed = Image.fromarray(sharpened)
                else:
                    # For downscaled, apply smoothing
                    img_array = np.array(resized)
                    smoothed = cv2.GaussianBlur(img_array, (3, 3), 0)
                    processed = Image.fromarray(smoothed)
                
                # Perform OCR with different PSM modes
                psm_modes = [6, 12]  # Block and sparse text modes
                for psm in psm_modes:
                    try:
                        config = f'--oem 3 --psm {psm}'
                        text_data = pytesseract.image_to_data(processed, config=config, 
                                                             output_type=pytesseract.Output.DICT)
                        
                        for i in range(len(text_data['text'])):
                            text = str(text_data['text'][i]).strip()
                            conf = text_data['conf'][i]
                            
                            if text and conf > 40:  # Higher threshold for multi-scale
                                # Scale coordinates back to original size
                                x = int(text_data['left'][i] / scale)
                                y = int(text_data['top'][i] / scale)
                                w = int(text_data['width'][i] / scale)
                                h = int(text_data['height'][i] / scale)
                                
                                element = {
                                    'type': self.classify_text_element(text),
                                    'text': text,
                                    'coordinates': {
                                        'x': x,
                                        'y': y,
                                        'width': w,
                                        'height': h
                                    },
                                    'center': {
                                        'x': x + w // 2,
                                        'y': y + h // 2
                                    },
                                    'confidence': conf / 100.0 * 0.8  # Slightly lower confidence for multi-scale
                                }
                                
                                # Check if this element is not a duplicate
                                is_duplicate = False
                                for existing in additional_elements:
                                    if (existing['text'] == text and 
                                        abs(existing['coordinates']['x'] - x) < 20 and
                                        abs(existing['coordinates']['y'] - y) < 20):
                                        is_duplicate = True
                                        break
                                
                                if not is_duplicate:
                                    additional_elements.append(element)
                    except Exception as e:
                        logger.debug(f"Multi-scale OCR at scale {scale}, PSM {psm} failed: {e}")
                        
        except Exception as e:
            logger.warning(f"Multi-scale detection failed: {e}")
        
        return additional_elements
    
    def detect_text_regions(self, screenshot: Image.Image, parameters: dict = None) -> list:
        """Detect text regions using OCR with bounding boxes and enhanced preprocessing"""
        text_elements = []
        
        try:
            if not OCR_AVAILABLE:
                return text_elements
            
            # Enhanced preprocessing for better OCR accuracy
            screenshot_enhanced = self.preprocess_for_ocr(screenshot)
            
            # Configure OCR for better accuracy
            custom_config = r'--oem 3 --psm 11 -c tessedit_char_blacklist=|}~`'
            
            # Perform OCR with detailed data on enhanced image
            text_data = pytesseract.image_to_data(screenshot_enhanced, config=custom_config, output_type=pytesseract.Output.DICT)
            
            # Enhanced text grouping with better accuracy
            current_line = []
            current_y = None
            line_threshold = 15  # Increased threshold for better line grouping
            min_confidence = 30  # Minimum confidence threshold
            
            for i in range(len(text_data['text'])):
                text = str(text_data['text'][i]).strip()
                conf = text_data['conf'][i]
                
                # Filter out low confidence and empty text
                if text and conf > min_confidence:
                    x = text_data['left'][i]
                    y = text_data['top'][i]
                    w = text_data['width'][i]
                    h = text_data['height'][i]
                    
                    # Check if this is part of the same line with improved logic
                    if current_y is None or abs(y - current_y) <= line_threshold:
                        current_line.append({
                            'text': text,
                            'x': x,
                            'y': y,
                            'width': w,
                            'height': h,
                            'confidence': conf / 100.0
                        })
                        # Update current_y as average for better line detection
                        if current_y is None:
                            current_y = y
                        else:
                            current_y = (current_y + y) / 2
                    else:
                        # Process the current line
                        if current_line:
                            combined_elem = self.combine_text_line(current_line)
                            if combined_elem and combined_elem['confidence'] > 0.3:
                                text_elements.append(combined_elem)
                        # Start new line
                        current_line = [{
                            'text': text,
                            'x': x,
                            'y': y,
                            'width': w,
                            'height': h,
                            'confidence': conf / 100.0
                        }]
                        current_y = y
            
            # Process last line
            if current_line:
                combined_elem = self.combine_text_line(current_line)
                if combined_elem and combined_elem['confidence'] > 0.3:
                    text_elements.append(combined_elem)
            
            # Perform multi-scale detection for better coverage
            if parameters and parameters.get('multi_scale', True):
                additional_elements = self.detect_text_multi_scale(screenshot)
                text_elements.extend(additional_elements)
            elif parameters is None:
                # Default behavior - include multi-scale
                additional_elements = self.detect_text_multi_scale(screenshot)
                text_elements.extend(additional_elements)
                    
        except Exception as e:
            logger.error(f"Error in text detection: {e}")
        
        return text_elements
    
    def combine_text_line(self, line_elements: list) -> dict:
        """Combine text elements in the same line with improved spacing"""
        if not line_elements:
            return None
        
        # Sort elements by x position for proper text ordering
        line_elements.sort(key=lambda e: e['x'])
        
        # Combine text with smart spacing
        combined_text = ''
        prev_end_x = None
        avg_char_width = sum(elem['width'] / max(len(elem['text']), 1) for elem in line_elements) / len(line_elements)
        
        for elem in line_elements:
            if prev_end_x is not None:
                gap = elem['x'] - prev_end_x
                # Add space if gap is significant
                if gap > avg_char_width * 0.5:
                    combined_text += ' '
            combined_text += elem['text']
            prev_end_x = elem['x'] + elem['width']
        
        combined_text = combined_text.strip()
        
        # Calculate bounding box
        min_x = min(elem['x'] for elem in line_elements)
        min_y = min(elem['y'] for elem in line_elements)
        max_x = max(elem['x'] + elem['width'] for elem in line_elements)
        max_y = max(elem['y'] + elem['height'] for elem in line_elements)
        
        width = max_x - min_x
        height = max_y - min_y
        
        # Weighted average confidence (weight by text length)
        total_weight = sum(len(elem['text']) for elem in line_elements)
        if total_weight > 0:
            avg_confidence = sum(elem['confidence'] * len(elem['text']) for elem in line_elements) / total_weight
        else:
            avg_confidence = sum(elem['confidence'] for elem in line_elements) / len(line_elements)
        
        # Determine element type based on text content
        element_type = self.classify_text_element(combined_text)
        
        return {
            'type': element_type,
            'text': combined_text,
            'coordinates': {
                'x': min_x,
                'y': min_y,
                'width': width,
                'height': height
            },
            'center': {
                'x': min_x + width // 2,
                'y': min_y + height // 2
            },
            'confidence': avg_confidence
        }
    
    def classify_text_element(self, text: str) -> str:
        """Classify the type of text element based on content"""
        text_lower = text.lower()
        
        # Check for button indicators
        button_keywords = ['click', 'submit', 'cancel', 'ok', 'apply', 'save', 'delete', 'close', 'open']
        if any(keyword in text_lower for keyword in button_keywords):
            return 'button'
        
        # Check for link patterns
        if 'http' in text_lower or 'www.' in text_lower or text_lower.endswith('.com'):
            return 'link'
        
        # Check for label patterns
        if text.endswith(':'):
            return 'label'
        
        # Check for title patterns (all caps or title case)
        if text.isupper() or (len(text.split()) > 1 and text.istitle()):
            return 'title'
        
        return 'text'
    
    def detect_ui_elements(self, image: np.ndarray) -> list:
        """Detect UI elements using computer vision techniques"""
        ui_elements = []
        
        try:
            # Convert to grayscale
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Apply edge detection
            edges = cv2.Canny(gray, 50, 150)
            
            # Find contours
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # Filter and process contours
            for contour in contours:
                area = cv2.contourArea(contour)
                
                # Filter out very small or very large contours
                if area < 100 or area > 500000:
                    continue
                
                # Get bounding rectangle
                x, y, w, h = cv2.boundingRect(contour)
                
                # Filter out very thin or very wide elements
                aspect_ratio = w / h if h > 0 else 0
                if aspect_ratio < 0.1 or aspect_ratio > 10:
                    continue
                
                # Classify element based on shape and size
                element_type = self.classify_ui_element(w, h, aspect_ratio)
                
                ui_elements.append({
                    'type': element_type,
                    'coordinates': {
                        'x': x,
                        'y': y,
                        'width': w,
                        'height': h
                    },
                    'center': {
                        'x': x + w // 2,
                        'y': y + h // 2
                    },
                    'confidence': 0.7  # Base confidence for contour detection
                })
                
        except Exception as e:
            logger.error(f"Error detecting UI elements: {e}")
        
        return ui_elements
    
    def classify_ui_element(self, width: int, height: int, aspect_ratio: float) -> str:
        """Classify UI element based on dimensions"""
        # Button-like dimensions
        if 50 <= width <= 300 and 20 <= height <= 60 and 1.5 <= aspect_ratio <= 6:
            return 'button'
        
        # Input field dimensions
        elif 100 <= width <= 500 and 20 <= height <= 40 and aspect_ratio > 3:
            return 'input_field'
        
        # Checkbox/radio button dimensions
        elif 10 <= width <= 30 and 10 <= height <= 30 and 0.8 <= aspect_ratio <= 1.2:
            return 'checkbox'
        
        # Icon dimensions
        elif 16 <= width <= 64 and 16 <= height <= 64 and 0.8 <= aspect_ratio <= 1.2:
            return 'icon'
        
        # Panel/container dimensions
        elif width > 200 and height > 200:
            return 'panel'
        
        else:
            return 'element'
    
    def detect_clickable_areas(self, image: np.ndarray) -> list:
        """Detect potentially clickable areas based on visual patterns"""
        clickable_elements = []
        
        try:
            # Convert to HSV for better color detection
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
            
            # Define color ranges for common button colors
            color_ranges = [
                # Blue buttons
                {'lower': np.array([100, 50, 50]), 'upper': np.array([130, 255, 255]), 'type': 'primary_button'},
                # Green buttons
                {'lower': np.array([40, 50, 50]), 'upper': np.array([80, 255, 255]), 'type': 'success_button'},
                # Red buttons
                {'lower': np.array([0, 50, 50]), 'upper': np.array([10, 255, 255]), 'type': 'danger_button'},
                # Gray buttons
                {'lower': np.array([0, 0, 100]), 'upper': np.array([180, 30, 200]), 'type': 'secondary_button'}
            ]
            
            for color_range in color_ranges:
                # Create mask for color range
                mask = cv2.inRange(hsv, color_range['lower'], color_range['upper'])
                
                # Apply morphological operations to clean up
                kernel = np.ones((5, 5), np.uint8)
                mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
                mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
                
                # Find contours in mask
                contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                
                for contour in contours:
                    area = cv2.contourArea(contour)
                    
                    # Filter by area
                    if area < 500 or area > 50000:
                        continue
                    
                    x, y, w, h = cv2.boundingRect(contour)
                    
                    # Check if dimensions are button-like
                    if 30 <= w <= 400 and 20 <= h <= 80:
                        clickable_elements.append({
                            'type': color_range['type'],
                            'coordinates': {
                                'x': x,
                                'y': y,
                                'width': w,
                                'height': h
                            },
                            'center': {
                                'x': x + w // 2,
                                'y': y + h // 2
                            },
                            'confidence': 0.8
                        })
                        
        except Exception as e:
            logger.error(f"Error detecting clickable areas: {e}")
        
        return clickable_elements
    
    async def list_windows(self) -> Dict[str, Any]:
        """List all open windows on the desktop"""
        try:
            logger.info("Listing all open windows...")
            
            # Use wmctrl to list windows
            import subprocess
            result = subprocess.run(['wmctrl', '-l'], capture_output=True, text=True)
            
            if result.returncode != 0:
                # wmctrl might not be installed, try xdotool
                result = subprocess.run(['xdotool', 'search', '--onlyvisible', '--name', '.*'], 
                                      capture_output=True, text=True)
                
                if result.returncode != 0:
                    return {
                        "success": False,
                        "error": "Window management tools not available"
                    }
                
                # Parse xdotool output
                window_ids = result.stdout.strip().split('\n')
                windows = []
                for wid in window_ids:
                    if wid:
                        # Get window info
                        name_result = subprocess.run(['xdotool', 'getwindowname', wid],
                                                    capture_output=True, text=True)
                        if name_result.returncode == 0:
                            windows.append({
                                "id": wid,
                                "title": name_result.stdout.strip()
                            })
            else:
                # Parse wmctrl output
                windows = []
                for line in result.stdout.strip().split('\n'):
                    if line:
                        parts = line.split(None, 3)
                        if len(parts) >= 4:
                            windows.append({
                                "id": parts[0],
                                "desktop": parts[1],
                                "pid": parts[2],
                                "title": parts[3]
                            })
            
            # Get current active window
            active_result = subprocess.run(['xdotool', 'getactivewindow', 'getwindowname'],
                                          capture_output=True, text=True)
            active_window = active_result.stdout.strip() if active_result.returncode == 0 else None
            
            return {
                "success": True,
                "windows": windows,
                "active_window": active_window,
                "window_count": len(windows)
            }
            
        except Exception as e:
            logger.error(f"Error listing windows: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def switch_to_window(self, window_identifier: str) -> Dict[str, Any]:
        """Switch to a specific window by title or index"""
        try:
            logger.info(f"Switching to window: {window_identifier}")
            
            # Try to switch by title first
            result = os.system(f"wmctrl -a '{window_identifier}' 2>/dev/null")
            
            if result != 0:
                # Try as window ID or use xdotool
                result = os.system(f"xdotool windowactivate --sync $(xdotool search --name '{window_identifier}' | head -1) 2>/dev/null")
            
            if result != 0:
                # Try Alt+Tab to cycle through windows
                try:
                    index = int(window_identifier)
                    # Press Alt+Tab the specified number of times
                    for _ in range(index):
                        pyautogui.hotkey('alt', 'tab')
                        time.sleep(0.2)
                except ValueError:
                    # Not a number, try to find window by partial match
                    pyautogui.hotkey('alt', 'tab')
            
            time.sleep(1)
            
            return {
                "success": True,
                "action": "Successfully switched to window",
                "window": window_identifier
            }
            
        except Exception as e:
            logger.error(f"Error switching window: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def arrange_windows(self, arrangement: str) -> Dict[str, Any]:
        """Arrange windows on the desktop"""
        try:
            logger.info(f"Arranging windows: {arrangement}")
            
            if arrangement == "tile":
                # Tile windows (split screen)
                # Use Super+Left for left tile, Super+Right for right tile
                pyautogui.hotkey('super', 'left')
                time.sleep(0.5)
                pyautogui.hotkey('alt', 'tab')
                time.sleep(0.5)
                pyautogui.hotkey('super', 'right')
                
            elif arrangement == "cascade":
                # Cascade windows (overlapping)
                # Get all windows and arrange them
                windows = await self.list_windows()
                if windows.get("success"):
                    offset = 0
                    for i, window in enumerate(windows.get("windows", [])):
                        if i < 5:  # Limit to first 5 windows
                            os.system(f"wmctrl -r '{window.get('title', '')}' -e 0,{50+offset},{50+offset},800,600 2>/dev/null || true")
                            offset += 30
                            
            elif arrangement == "minimize_all":
                # Minimize all windows
                pyautogui.hotkey('super', 'd')
                
            elif arrangement == "show_desktop":
                # Show desktop (minimize all)
                pyautogui.hotkey('super', 'd')
                
            elif arrangement == "restore_all":
                # Try to restore windows
                pyautogui.hotkey('super', 'd')  # Toggle desktop
                time.sleep(0.5)
                pyautogui.hotkey('super', 'd')  # Toggle back
                
            else:
                return {
                    "success": False,
                    "error": f"Unknown arrangement type: {arrangement}",
                    "supported": ["tile", "cascade", "minimize_all", "show_desktop", "restore_all"]
                }
            
            time.sleep(1)
            
            return {
                "success": True,
                "action": "Successfully arranged windows",
                "arrangement": arrangement
            }
            
        except Exception as e:
            logger.error(f"Error arranging windows: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    # Terminal management methods - Using subprocess for reliability
    def __init_terminal_session(self):
        """Initialize terminal session variables"""
        if not hasattr(self, 'terminal_processes'):
            self.terminal_processes = {}
        if not hasattr(self, 'terminal_history'):
            self.terminal_history = []
        if not hasattr(self, 'current_terminal_id'):
            self.current_terminal_id = None
    
    def _filter_terminal_warnings(self, text: str) -> str:
        """NO LONGER FILTER - Return raw output"""
        # Return text as-is, no filtering
        return text
    
    async def terminal_connect(self) -> Dict[str, Any]:
        """Create a new subprocess terminal session"""
        try:
            # Initialize terminal session variables
            self.__init_terminal_session()
            
            # Check if we already have an active terminal session
            if self.current_terminal_id and self.current_terminal_id in self.terminal_processes:
                proc = self.terminal_processes[self.current_terminal_id]
                if proc.poll() is None:  # Process is still running
                    logger.info(f"Terminal session {self.current_terminal_id} already active")
                    return {
                        "success": True,
                        "action": "terminal_connect",
                        "status": "connected_to_existing",
                        "session_id": self.current_terminal_id,
                        "message": "Connected to existing terminal session"
                    }
            
            # Create a new terminal session using subprocess
            session_id = str(uuid.uuid4())[:8]
            logger.info(f"Creating new terminal session: {session_id}")
            
            # Determine shell and working directory
            shell = '/bin/bash' if os.path.exists('/bin/bash') else 'bash'
            
            # Use /home/desktop/Desktop as the base directory
            work_dir = '/home/desktop/Desktop'
            
            # Create the directory if it doesn't exist
            if not os.path.exists(work_dir):
                os.makedirs(work_dir, exist_ok=True)
                logger.info(f"Created directory: {work_dir}")
            
            logger.info(f"Using working directory: {work_dir}")
            
            # Create subprocess with pipes for stdin/stdout/stderr
            process = subprocess.Popen(
                [shell],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=0,  # Unbuffered
                universal_newlines=True,
                env={**os.environ, 'TERM': 'xterm-256color'},
                cwd=work_dir
            )
            
            # Store the process
            self.terminal_processes[session_id] = process
            self.current_terminal_id = session_id
            
            logger.info(f"Terminal session {session_id} created successfully")
            
            return {
                "success": True,
                "action": "terminal_connect",
                "status": "created_new_session",
                "session_id": session_id,
                "message": "New terminal session created",
                "working_directory": work_dir
            }
                
        except Exception as e:
            logger.error(f"Error in terminal_connect: {e}")
            return {
                "success": False,
                "error": str(e),
                "action": "terminal_connect"
            }
    
    async def terminal_execute(self, command: str, wait_for_output: bool = True, timeout: int = 5) -> Dict[str, Any]:
        """Execute command using subprocess and capture output reliably"""
        try:
            # Initialize terminal session if needed
            self.__init_terminal_session()
            
            # Always use subprocess.run for reliable output capture
            logger.info(f"Executing command with subprocess: {command}")
            
            # Use /home/desktop/Desktop as the base directory
            work_dir = '/home/desktop/Desktop'
            
            # Create the directory if it doesn't exist
            if not os.path.exists(work_dir):
                os.makedirs(work_dir, exist_ok=True)
                logger.info(f"Created directory: {work_dir}")
            
            logger.info(f"Executing in directory: {work_dir}")
            
            # Run the command with timeout
            try:
                result = subprocess.run(
                    command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    cwd=work_dir,
                    env={**os.environ, 'TERM': 'xterm-256color'},
                    errors='replace'  # Handle any encoding issues
                )
                
                # Get raw stdout and stderr - NO FILTERING
                stdout = result.stdout if result.stdout else ""
                stderr = result.stderr if result.stderr else ""
                
                # Combine output - stdout first, then stderr
                if stdout and stderr:
                    output = stdout + "\n" + stderr
                elif stdout:
                    output = stdout
                elif stderr:
                    output = stderr
                else:
                    output = ""  # Truly empty output - no artificial messages
                
                # Store in history with RAW output
                self.terminal_history.append({
                    'command': command,
                    'output': output,  # RAW output, no filtering
                    'exit_code': result.returncode,
                    'timestamp': time.time()
                })
                
                # Keep only last 50 commands
                if len(self.terminal_history) > 50:
                    self.terminal_history = self.terminal_history[-50:]
                
                logger.info(f"Command executed with exit code: {result.returncode}, output length: {len(output)}")
                
                return {
                    "success": result.returncode == 0,
                    "action": "terminal_execute",
                    "command": command,
                    "output": output,  # RAW output
                    "exit_code": result.returncode,
                    "message": "Command executed" if output else "Command executed (no output)"
                }
                
            except subprocess.TimeoutExpired as e:
                logger.error(f"Command timed out after {timeout} seconds")
                # Try to get partial output if available
                partial_output = ""
                if hasattr(e, 'stdout') and e.stdout:
                    partial_output = e.stdout.decode('utf-8', errors='replace') if isinstance(e.stdout, bytes) else str(e.stdout)
                if hasattr(e, 'stderr') and e.stderr:
                    stderr_text = e.stderr.decode('utf-8', errors='replace') if isinstance(e.stderr, bytes) else str(e.stderr)
                    partial_output = partial_output + "\n" + stderr_text if partial_output else stderr_text
                
                # If we have partial output, show it; otherwise show the timeout message
                output = partial_output if partial_output else ""
                
                return {
                    "success": False,
                    "action": "terminal_execute",
                    "command": command,
                    "output": output,
                    "error": f"Command timed out after {timeout} seconds",
                    "message": f"Command timed out after {timeout} seconds"
                }
                
        except Exception as e:
            logger.error(f"Error executing terminal command: {e}")
            return {
                "success": False,
                "error": str(e),
                "action": "terminal_execute",
                "command": command
            }
    
    async def terminal_type(self, text: str) -> Dict[str, Any]:
        """Send text to terminal session without executing (no newline)"""
        try:
            # Initialize terminal session if needed
            self.__init_terminal_session()
            
            # Ensure we have an active terminal session
            if not self.current_terminal_id or self.current_terminal_id not in self.terminal_processes:
                connect_result = await self.terminal_connect()
                if not connect_result['success']:
                    return connect_result
            
            proc = self.terminal_processes[self.current_terminal_id]
            if proc.poll() is not None:
                # Process has terminated, create a new one
                connect_result = await self.terminal_connect()
                if not connect_result['success']:
                    return connect_result
                proc = self.terminal_processes[self.current_terminal_id]
            
            # Write text to process stdin without newline
            proc.stdin.write(text)
            proc.stdin.flush()
            
            logger.info(f"Text sent to terminal: {text}")
            
            return {
                "success": True,
                "action": "terminal_type",
                "text": text,
                "session_id": self.current_terminal_id,
                "message": "Text sent to terminal session (no enter pressed)"
            }
            
        except Exception as e:
            logger.error(f"Error typing in terminal: {e}")
            return {
                "success": False,
                "error": str(e),
                "action": "terminal_type"
            }
    
    async def terminal_read(self) -> Dict[str, Any]:
        """Read the last command output from terminal history"""
        try:
            # Initialize terminal session if needed
            self.__init_terminal_session()
            
            # Fall back to command history
            if self.terminal_history:
                # Get the last command and its output
                last_entry = self.terminal_history[-1]
                
                # Get last 5 commands for context
                recent_history = []
                for entry in self.terminal_history[-5:]:
                    recent_history.append({
                        'command': entry['command'],
                        'output': entry['output'][:500] if entry.get('output') else "",
                        'exit_code': entry.get('exit_code', 0),
                        'timestamp': entry.get('timestamp', 0)
                    })
                
                return {
                    "success": True,
                    "action": "terminal_read",
                    "last_command": last_entry['command'],
                    "output": last_entry.get('output', ''),
                    "exit_code": last_entry.get('exit_code', 0),
                    "recent_history": recent_history,
                    "total_commands": len(self.terminal_history),
                    "source": "history",
                    "message": "Terminal output retrieved from command history"
                }
            else:
                return {
                    "success": True,
                    "action": "terminal_read",
                    "message": "No command history available yet. Execute a command first.",
                    "output": "",
                    "recent_history": [],
                    "source": "none"
                }
            
        except Exception as e:
            logger.error(f"Error reading from terminal: {e}")
            return {
                "success": False,
                "error": str(e),
                "action": "terminal_read"
            }
    
    async def terminal_clear(self) -> Dict[str, Any]:
        """Clear terminal screen using subprocess"""
        try:
            # Simply run the clear command
            result = subprocess.run(
                'clear',
                shell=True,
                capture_output=True,
                text=True,
                timeout=1
            )
            
            # If we have an active session, send clear to it as well
            if hasattr(self, 'current_terminal_id') and self.current_terminal_id in self.terminal_processes:
                proc = self.terminal_processes[self.current_terminal_id]
                if proc.poll() is None:
                    proc.stdin.write('clear\n')
                    proc.stdin.flush()
            
            logger.info("Terminal cleared")
            
            return {
                "success": True,
                "action": "terminal_clear",
                "message": "Terminal screen cleared"
            }
            
        except Exception as e:
            logger.error(f"Error clearing terminal: {e}")
            return {
                "success": False,
                "error": str(e),
                "action": "terminal_clear"
            }
    
    async def terminal_close(self) -> Dict[str, Any]:
        """Close terminal subprocess sessions"""
        try:
            # Initialize terminal session if needed
            self.__init_terminal_session()
            
            closed_sessions = []
            
            # Close all terminal processes
            for session_id, proc in list(self.terminal_processes.items()):
                if proc.poll() is None:  # Process is still running
                    try:
                        # Send exit command
                        proc.stdin.write('exit\n')
                        proc.stdin.flush()
                        
                        # Wait briefly for graceful exit
                        await asyncio.sleep(0.5)
                        
                        # If still running, terminate
                        if proc.poll() is None:
                            proc.terminate()
                            
                            # Wait for termination
                            try:
                                proc.wait(timeout=2)
                            except subprocess.TimeoutExpired:
                                # Force kill if needed
                                proc.kill()
                                proc.wait()
                        
                        closed_sessions.append(session_id)
                        logger.info(f"Closed terminal session: {session_id}")
                        
                    except Exception as e:
                        logger.error(f"Error closing session {session_id}: {e}")
                
                # Remove from dictionary
                del self.terminal_processes[session_id]
            
            # Clear current session ID
            self.current_terminal_id = None
            
            # Clear history
            self.terminal_history = []
            
            logger.info(f"Closed {len(closed_sessions)} terminal sessions")
            
            return {
                "success": True,
                "action": "terminal_close",
                "closed_sessions": closed_sessions,
                "message": f"Successfully closed {len(closed_sessions)} terminal session(s)"
            }
            
        except Exception as e:
            logger.error(f"Error closing terminal sessions: {e}")
            return {
                "success": False,
                "error": str(e),
                "action": "terminal_close"
            }
    
    # File operation methods - standardized and reliable
    async def file_read(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Read file contents using Python file I/O"""
        try:
            filepath = params.get('filepath', '')
            if not filepath:
                return {"success": False, "error": "No filepath provided"}
            
            # Expand ~ to home directory if present
            if filepath.startswith('~'):
                filepath = os.path.expanduser(filepath)
            elif not filepath.startswith('/'):
                # Make relative paths absolute (relative to desktop home)
                filepath = os.path.join('/home/desktop/Desktop', filepath)
            
            try:
                # Check if file exists
                if not os.path.exists(filepath):
                    return {
                        "success": False,
                        "error": f"File not found: {filepath}"
                    }
                
                # Check if it's a file (not directory)
                if os.path.isdir(filepath):
                    return {
                        "success": False,
                        "error": f"Path is a directory, not a file: {filepath}"
                    }
                
                # Read the file
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                return {
                    "success": True,
                    "action": "file_read",
                    "filepath": filepath,
                    "content": content,
                    "message": f"Successfully read file: {filepath}"
                }
            except PermissionError:
                return {
                    "success": False,
                    "error": f"Permission denied reading {filepath}"
                }
            except UnicodeDecodeError:
                # Try reading as binary if UTF-8 fails
                try:
                    with open(filepath, 'rb') as f:
                        content = f.read()
                    return {
                        "success": True,
                        "action": "file_read",
                        "filepath": filepath,
                        "content": f"[Binary file, {len(content)} bytes]",
                        "message": f"File is binary: {filepath}"
                    }
                except Exception as e:
                    return {
                        "success": False,
                        "error": f"Error reading file: {str(e)}"
                    }
                
        except Exception as e:
            logger.error(f"Error reading file: {e}")
            return {"success": False, "error": str(e)}
    
    async def file_write(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Write/create file with content using Python file I/O"""
        try:
            filepath = params.get('filepath', '')
            content = params.get('content', '')
            
            if not filepath:
                return {"success": False, "error": "No filepath provided"}
            
            # Expand ~ to home directory if present
            if filepath.startswith('~'):
                filepath = os.path.expanduser(filepath)
            elif not filepath.startswith('/'):
                # Make relative paths absolute (relative to desktop home)
                filepath = os.path.join('/home/desktop/Desktop', filepath)
            
            try:
                # Create directory if it doesn't exist with proper permissions
                directory = os.path.dirname(filepath)
                if directory and not os.path.exists(directory):
                    # Create with full permissions for owner and group
                    os.makedirs(directory, mode=0o755, exist_ok=True)
                    # Ensure desktop user owns the directory
                    try:
                        import pwd
                        uid = pwd.getpwnam('desktop').pw_uid
                        gid = pwd.getpwnam('desktop').pw_gid
                        os.chown(directory, uid, gid)
                    except:
                        pass  # Ignore if we can't change ownership
                
                # Write the file
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                
                # Set proper permissions on the file (readable/writable by owner and group)
                try:
                    os.chmod(filepath, 0o664)
                    # Ensure desktop user owns the file
                    import pwd
                    uid = pwd.getpwnam('desktop').pw_uid
                    gid = pwd.getpwnam('desktop').pw_gid
                    os.chown(filepath, uid, gid)
                except:
                    pass  # Ignore if we can't change permissions/ownership
                
                # Get file size
                file_size = os.path.getsize(filepath)
                
                return {
                    "success": True,
                    "action": "file_write",
                    "filepath": filepath,
                    "message": f"Successfully wrote file: {filepath}",
                    "bytes_written": file_size
                }
            except PermissionError:
                return {
                    "success": False,
                    "error": f"Permission denied writing to {filepath}"
                }
            except IOError as e:
                return {
                    "success": False,
                    "error": f"IO error writing file: {str(e)}"
                }
                
        except Exception as e:
            logger.error(f"Error writing file: {e}")
            return {"success": False, "error": str(e)}
    
    async def file_edit(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Edit file by replacing specific content using Python file I/O"""
        try:
            filepath = params.get('filepath', '')
            # Support both old_text/new_text and find/replace parameter names
            old_text = params.get('old_text') or params.get('find', '')
            new_text = params.get('new_text') or params.get('replace', '')
            
            if not filepath or old_text is None:
                return {"success": False, "error": "Missing filepath or text to find"}
            
            # Expand ~ to home directory if present
            if filepath.startswith('~'):
                filepath = os.path.expanduser(filepath)
            elif not filepath.startswith('/'):
                # Make relative paths absolute (relative to desktop home)
                filepath = os.path.join('/home/desktop/Desktop', filepath)
            
            try:
                # Check if file exists
                if not os.path.exists(filepath):
                    return {
                        "success": False,
                        "error": f"File not found: {filepath}"
                    }
                
                # Read the current content
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Count replacements
                replacements = content.count(old_text)
                
                if replacements == 0:
                    return {
                        "success": False,
                        "error": f"Text '{old_text}' not found in file"
                    }
                
                # Create backup
                backup_path = f"{filepath}.bak"
                with open(backup_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                
                # Replace the text
                new_content = content.replace(old_text, new_text)
                
                # Write the new content
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                
                return {
                    "success": True,
                    "action": "file_edit",
                    "filepath": filepath,
                    "message": f"Successfully edited file: {filepath}",
                    "replacements": replacements,
                    "backup": backup_path
                }
            except PermissionError:
                return {
                    "success": False,
                    "error": f"Permission denied editing {filepath}"
                }
            except Exception as e:
                return {
                    "success": False,
                    "error": f"Error editing file: {str(e)}"
                }
                
        except Exception as e:
            logger.error(f"Error editing file: {e}")
            return {"success": False, "error": str(e)}
    
    async def file_append(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Append content to file using Python file I/O"""
        try:
            filepath = params.get('filepath', '')
            content = params.get('content', '')
            
            if not filepath:
                return {"success": False, "error": "No filepath provided"}
            
            # Expand ~ to home directory if present
            if filepath.startswith('~'):
                filepath = os.path.expanduser(filepath)
            elif not filepath.startswith('/'):
                # Make relative paths absolute (relative to desktop home)
                filepath = os.path.join('/home/desktop/Desktop', filepath)
            
            try:
                # Create directory if it doesn't exist with proper permissions
                directory = os.path.dirname(filepath)
                if directory and not os.path.exists(directory):
                    # Create with full permissions for owner and group
                    os.makedirs(directory, mode=0o755, exist_ok=True)
                    # Ensure desktop user owns the directory
                    try:
                        import pwd
                        uid = pwd.getpwnam('desktop').pw_uid
                        gid = pwd.getpwnam('desktop').pw_gid
                        os.chown(directory, uid, gid)
                    except:
                        pass  # Ignore if we can't change ownership
                
                # Append to the file (creates if doesn't exist)
                with open(filepath, 'a', encoding='utf-8') as f:
                    f.write(content)
                    # Add newline if content doesn't end with one
                    if content and not content.endswith('\n'):
                        f.write('\n')
                
                # Get file size after append
                file_size = os.path.getsize(filepath)
                
                return {
                    "success": True,
                    "action": "file_append",
                    "filepath": filepath,
                    "message": f"Successfully appended to file: {filepath}",
                    "bytes_appended": len(content),
                    "total_size": file_size
                }
            except PermissionError:
                return {
                    "success": False,
                    "error": f"Permission denied appending to {filepath}"
                }
            except IOError as e:
                return {
                    "success": False,
                    "error": f"IO error appending to file: {str(e)}"
                }
                
        except Exception as e:
            logger.error(f"Error appending to file: {e}")
            return {"success": False, "error": str(e)}
    
    async def file_delete(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Delete a file using Python file I/O"""
        try:
            filepath = params.get('filepath', '')
            
            if not filepath:
                return {"success": False, "error": "No filepath provided"}
            
            # Expand ~ to home directory if present
            if filepath.startswith('~'):
                filepath = os.path.expanduser(filepath)
            elif not filepath.startswith('/'):
                # Make relative paths absolute (relative to desktop home)
                filepath = os.path.join('/home/desktop/Desktop', filepath)
            
            try:
                # Check if file exists
                if not os.path.exists(filepath):
                    return {
                        "success": False,
                        "error": f"File not found: {filepath}"
                    }
                
                # Get file size before deletion
                file_size = os.path.getsize(filepath)
                
                # Delete the file
                os.remove(filepath)
                
                return {
                    "success": True,
                    "action": "file_delete",
                    "filepath": filepath,
                    "message": f"Successfully deleted file: {filepath}",
                    "size_deleted": file_size
                }
            except PermissionError:
                return {
                    "success": False,
                    "error": f"Permission denied deleting {filepath}"
                }
            except IsADirectoryError:
                return {
                    "success": False,
                    "error": f"Path is a directory, not a file: {filepath}"
                }
            except Exception as e:
                return {
                    "success": False,
                    "error": f"Error deleting file: {str(e)}"
                }
                
        except Exception as e:
            logger.error(f"Error deleting file: {e}")
            return {"success": False, "error": str(e)}
    
    async def file_exists(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Check if file exists using Python file I/O"""
        try:
            filepath = params.get('filepath', '')
            
            if not filepath:
                return {"success": False, "error": "No filepath provided"}
            
            # Expand ~ to home directory if present
            if filepath.startswith('~'):
                filepath = os.path.expanduser(filepath)
            elif not filepath.startswith('/'):
                # Make relative paths absolute (relative to desktop home)
                filepath = os.path.join('/home/desktop/Desktop', filepath)
            
            try:
                exists = os.path.exists(filepath)
                
                # Get file info if exists
                if exists:
                    is_dir = os.path.isdir(filepath)
                    if not is_dir:
                        file_size = os.path.getsize(filepath)
                        # Get modification time
                        import time
                        mtime = os.path.getmtime(filepath)
                        mtime_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(mtime))
                    else:
                        file_size = None
                        mtime_str = None
                    
                    return {
                        "success": True,
                        "action": "file_exists",
                        "filepath": filepath,
                        "exists": True,
                        "is_directory": is_dir,
                        "size": file_size,
                        "modified": mtime_str,
                        "message": f"{'Directory' if is_dir else 'File'} exists: {filepath}"
                    }
                else:
                    return {
                        "success": True,
                        "action": "file_exists",
                        "filepath": filepath,
                        "exists": False,
                        "message": f"File does not exist: {filepath}"
                    }
            except Exception as e:
                return {
                    "success": False,
                    "error": f"Error checking file: {str(e)}"
                }
                
        except Exception as e:
            logger.error(f"Error checking file: {e}")
            return {"success": False, "error": str(e)}
    
    async def directory_list(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """List all files and directories in a directory"""
        try:
            dirpath = params.get('dirpath', '')
            
            if not dirpath:
                # Default to Desktop directory
                dirpath = '/home/desktop/Desktop'
            
            # Expand ~ to home directory if present
            if dirpath.startswith('~'):
                dirpath = os.path.expanduser(dirpath)
            elif not dirpath.startswith('/'):
                # Make relative paths absolute (relative to desktop home)
                dirpath = os.path.join('/home/desktop/Desktop', dirpath)
            
            try:
                # Check if path exists
                if not os.path.exists(dirpath):
                    return {
                        "success": False,
                        "error": f"Directory not found: {dirpath}"
                    }
                
                # Check if it's actually a directory
                if not os.path.isdir(dirpath):
                    return {
                        "success": False,
                        "error": f"Path is not a directory: {dirpath}"
                    }
                
                # List directory contents
                items = []
                total_size = 0
                
                try:
                    for item_name in sorted(os.listdir(dirpath)):
                        item_path = os.path.join(dirpath, item_name)
                        try:
                            stat = os.stat(item_path)
                            is_dir = os.path.isdir(item_path)
                            
                            # Get modification time
                            import time
                            mtime = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(stat.st_mtime))
                            
                            item_info = {
                                "name": item_name,
                                "type": "directory" if is_dir else "file",
                                "size": stat.st_size if not is_dir else None,
                                "modified": mtime,
                                "permissions": oct(stat.st_mode)[-3:],
                                "path": item_path
                            }
                            
                            # For directories, try to count items inside
                            if is_dir:
                                try:
                                    item_count = len(os.listdir(item_path))
                                    item_info["item_count"] = item_count
                                except:
                                    item_info["item_count"] = 0
                            
                            items.append(item_info)
                            if not is_dir:
                                total_size += stat.st_size
                                
                        except Exception as e:
                            # Skip items we can't access
                            items.append({
                                "name": item_name,
                                "type": "unknown",
                                "error": str(e)
                            })
                    
                    # Count totals
                    dirs = [i for i in items if i.get('type') == 'directory']
                    files = [i for i in items if i.get('type') == 'file']
                    
                    return {
                        "success": True,
                        "action": "directory_list",
                        "dirpath": dirpath,
                        "items": items,
                        "summary": {
                            "total_items": len(items),
                            "directories": len(dirs),
                            "files": len(files),
                            "total_size": total_size
                        },
                        "message": f"Listed {len(items)} items in {dirpath}"
                    }
                    
                except PermissionError:
                    return {
                        "success": False,
                        "error": f"Permission denied accessing directory: {dirpath}"
                    }
                    
            except Exception as e:
                return {
                    "success": False,
                    "error": f"Error listing directory: {str(e)}"
                }
                
        except Exception as e:
            logger.error(f"Error listing directory: {e}")
            return {"success": False, "error": str(e)}
    
    async def directory_delete(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Delete a directory and all its contents using Python"""
        try:
            dirpath = params.get('dirpath', '')
            
            if not dirpath:
                return {"success": False, "error": "No directory path provided"}
            
            # Expand ~ to home directory if present
            if dirpath.startswith('~'):
                dirpath = os.path.expanduser(dirpath)
            elif not dirpath.startswith('/'):
                # Make relative paths absolute (relative to desktop home)
                dirpath = os.path.join('/home/desktop/Desktop', dirpath)
            
            try:
                # Check if path exists
                if not os.path.exists(dirpath):
                    return {
                        "success": False,
                        "error": f"Directory not found: {dirpath}"
                    }
                
                # Check if it's actually a directory
                if not os.path.isdir(dirpath):
                    return {
                        "success": False,
                        "error": f"Path is not a directory: {dirpath}"
                    }
                
                # Try to remove directory tree
                import shutil
                
                # First try to change permissions to ensure we can delete
                try:
                    # Make everything writable before deletion
                    for root, dirs, files in os.walk(dirpath):
                        for d in dirs:
                            os.chmod(os.path.join(root, d), 0o755)
                        for f in files:
                            os.chmod(os.path.join(root, f), 0o644)
                    os.chmod(dirpath, 0o755)
                except:
                    pass  # Continue even if chmod fails
                
                # Remove the directory tree
                shutil.rmtree(dirpath, ignore_errors=False)
                
                return {
                    "success": True,
                    "action": "directory_delete",
                    "dirpath": dirpath,
                    "message": f"Successfully deleted directory: {dirpath}"
                }
                
            except PermissionError as e:
                # Try alternative method using subprocess
                try:
                    import subprocess
                    result = subprocess.run(['rm', '-rf', dirpath], 
                                          capture_output=True, text=True, timeout=5)
                    if result.returncode == 0:
                        return {
                            "success": True,
                            "action": "directory_delete",
                            "dirpath": dirpath,
                            "message": f"Successfully deleted directory using rm -rf: {dirpath}"
                        }
                    else:
                        return {
                            "success": False,
                            "error": f"Permission denied (tried both methods): {str(e)}"
                        }
                except:
                    return {
                        "success": False,
                        "error": f"Permission denied deleting directory: {str(e)}"
                    }
            except Exception as e:
                return {
                    "success": False,
                    "error": f"Error deleting directory: {str(e)}"
                }
                
        except Exception as e:
            logger.error(f"Error deleting directory: {e}")
            return {"success": False, "error": str(e)}
    
    async def file_upload(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle file upload from client to container"""
        try:
            filepath = params.get('filepath', '')
            content = params.get('content', '')
            encoding = params.get('encoding', 'utf-8')  # or 'base64' for binary files
            
            if not filepath:
                return {"success": False, "error": "No filepath provided"}
            
            if not content:
                return {"success": False, "error": "No content provided"}
            
            # Expand ~ to the home directory FIRST. The web client sends an
            # OS-portable "~/Desktop/<name>" so the same path resolves on
            # Windows, cloud Linux, and this container; expanding up front
            # turns it into an absolute path here ("/home/desktop/Desktop/...").
            # The old order (prepend-then-expand) treated "~/Desktop/x" as a
            # relative path and produced "/home/desktop/Desktop/~/Desktop/x".
            filepath = os.path.expanduser(filepath)

            # Anything still relative defaults to the Desktop.
            if not os.path.isabs(filepath):
                filepath = os.path.join(os.path.expanduser('~/Desktop'), filepath)

            # Create directory if it doesn't exist
            directory = os.path.dirname(filepath)
            if directory and not os.path.exists(directory):
                try:
                    os.makedirs(directory, mode=0o755, exist_ok=True)
                    logger.info(f"Created directory: {directory}")
                except Exception as e:
                    return {"success": False, "error": f"Failed to create directory: {str(e)}"}
            
            # Handle different encodings
            try:
                if encoding == 'base64':
                    # Binary file uploaded as base64
                    import base64
                    file_content = base64.b64decode(content)
                    mode = 'wb'
                else:
                    # Text file
                    file_content = content
                    mode = 'w'
                
                # Write the file. Text mode pins encoding="utf-8" so a file
                # containing characters outside the host's locale codec (e.g.
                # U+2192 "->" under Windows cp1252 / a bare-locale "ascii"
                # container) writes correctly instead of raising a
                # UnicodeEncodeError. Binary mode takes no encoding.
                open_kwargs = {} if 'b' in mode else {'encoding': 'utf-8'}
                with open(filepath, mode, **open_kwargs) as f:
                    f.write(file_content)
                
                # Get file info
                stat = os.stat(filepath)
                file_size = stat.st_size
                
                return {
                    "success": True,
                    "action": "file_upload",
                    "filepath": filepath,
                    "size": file_size,
                    "message": f"Successfully uploaded file to {filepath} ({file_size} bytes)"
                }
                
            except Exception as e:
                return {"success": False, "error": f"Failed to write file: {str(e)}"}
                
        except Exception as e:
            logger.error(f"Error uploading file: {e}")
            return {"success": False, "error": str(e)}
    
    async def file_download(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle file download from container to client"""
        try:
            filepath = params.get('filepath', '')
            encoding = params.get('encoding', 'auto')  # auto, utf-8, or base64
            
            if not filepath:
                return {"success": False, "error": "No filepath provided"}
            
            # Handle relative paths
            if not filepath.startswith('/'):
                # Default to Desktop for relative paths
                filepath = os.path.join('/home/desktop/Desktop', filepath)
            
            # Expand ~ to home directory
            filepath = os.path.expanduser(filepath)
            
            # Check if file exists
            if not os.path.exists(filepath):
                return {"success": False, "error": f"File not found: {filepath}"}
            
            if not os.path.isfile(filepath):
                return {"success": False, "error": f"Path is not a file: {filepath}"}
            
            # Get file info
            stat = os.stat(filepath)
            file_size = stat.st_size
            
            # Check file size limit (10MB)
            if file_size > 10 * 1024 * 1024:
                return {
                    "success": False, 
                    "error": f"File too large ({file_size} bytes). Maximum size is 10MB"
                }
            
            try:
                # Auto-detect encoding based on file content
                if encoding == 'auto':
                    # Try to read as text first
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            content = f.read()
                        encoding = 'utf-8'
                    except UnicodeDecodeError:
                        # Binary file, read as bytes and encode to base64
                        with open(filepath, 'rb') as f:
                            content_bytes = f.read()
                        import base64
                        content = base64.b64encode(content_bytes).decode('ascii')
                        encoding = 'base64'
                elif encoding == 'base64':
                    # Force binary/base64 encoding
                    with open(filepath, 'rb') as f:
                        content_bytes = f.read()
                    import base64
                    content = base64.b64encode(content_bytes).decode('ascii')
                else:
                    # Try to read as text with specified encoding
                    with open(filepath, 'r', encoding=encoding) as f:
                        content = f.read()
                
                return {
                    "success": True,
                    "action": "file_download",
                    "filepath": filepath,
                    "filename": os.path.basename(filepath),
                    "size": file_size,
                    "encoding": encoding,
                    "content": content,
                    "message": f"Successfully downloaded {filepath}"
                }
                
            except Exception as e:
                return {"success": False, "error": f"Failed to read file: {str(e)}"}
                
        except Exception as e:
            logger.error(f"Error downloading file: {e}")
            return {"success": False, "error": str(e)}
    
    async def file_list_downloads(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """List files available for download in a directory"""
        try:
            dirpath = params.get('dirpath', '/home/desktop/Desktop')
            recursive = params.get('recursive', False)
            max_files = params.get('max_files', 100)
            
            # Handle relative paths
            if not dirpath.startswith('/'):
                dirpath = os.path.join('/home/desktop/Desktop', dirpath)
            
            # Expand ~ to home directory
            dirpath = os.path.expanduser(dirpath)
            
            # Check if directory exists
            if not os.path.exists(dirpath):
                return {"success": False, "error": f"Directory not found: {dirpath}"}
            
            if not os.path.isdir(dirpath):
                return {"success": False, "error": f"Path is not a directory: {dirpath}"}
            
            files = []
            total_size = 0
            file_count = 0
            
            try:
                if recursive:
                    # Walk through all subdirectories
                    for root, dirs, filenames in os.walk(dirpath):
                        for filename in filenames:
                            if file_count >= max_files:
                                break
                            
                            filepath = os.path.join(root, filename)
                            try:
                                stat = os.stat(filepath)
                                # Get relative path from base directory
                                rel_path = os.path.relpath(filepath, dirpath)
                                
                                files.append({
                                    "filename": filename,
                                    "path": filepath,
                                    "relative_path": rel_path,
                                    "size": stat.st_size,
                                    "modified": time.strftime('%Y-%m-%d %H:%M:%S', 
                                                             time.localtime(stat.st_mtime)),
                                    "downloadable": stat.st_size <= 10 * 1024 * 1024  # Max 10MB
                                })
                                total_size += stat.st_size
                                file_count += 1
                            except Exception as e:
                                logger.warning(f"Could not stat file {filepath}: {e}")
                        
                        if file_count >= max_files:
                            break
                else:
                    # List only files in the specified directory
                    for filename in os.listdir(dirpath):
                        if file_count >= max_files:
                            break
                        
                        filepath = os.path.join(dirpath, filename)
                        if os.path.isfile(filepath):
                            try:
                                stat = os.stat(filepath)
                                files.append({
                                    "filename": filename,
                                    "path": filepath,
                                    "relative_path": filename,
                                    "size": stat.st_size,
                                    "modified": time.strftime('%Y-%m-%d %H:%M:%S', 
                                                             time.localtime(stat.st_mtime)),
                                    "downloadable": stat.st_size <= 10 * 1024 * 1024  # Max 10MB
                                })
                                total_size += stat.st_size
                                file_count += 1
                            except Exception as e:
                                logger.warning(f"Could not stat file {filepath}: {e}")
                
                # Sort files by name
                files.sort(key=lambda x: x['filename'].lower())
                
                return {
                    "success": True,
                    "action": "file_list_downloads",
                    "directory": dirpath,
                    "files": files,
                    "total_files": len(files),
                    "total_size": total_size,
                    "message": f"Found {len(files)} downloadable files in {dirpath}"
                }
                
            except Exception as e:
                return {"success": False, "error": f"Failed to list files: {str(e)}"}
                
        except Exception as e:
            logger.error(f"Error listing files for download: {e}")
            return {"success": False, "error": str(e)}
    
    async def browser_open_and_connect(self) -> Dict[str, Any]:
        """Open Chrome browser and connect to it for automation"""
        try:
            # First check if Chrome is already running with debugging port
            logger.info("Checking if Chrome is already running...")
            
            import socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            result = sock.connect_ex(('localhost', 9222))
            sock.close()
            
            if result == 0:
                # Chrome is already running with debugging port, just connect to it
                logger.info("Chrome is already running with debugging port enabled, connecting...")
                return await self.connect_to_browser()
            
            # Check if Chrome process exists without debugging port
            chrome_running = os.system("pgrep -f chrome > /dev/null 2>&1") == 0
            
            if chrome_running:
                logger.info("Chrome is running but without debugging port, killing and restarting...")
                os.system("pkill -f chrome || true")
                time.sleep(2)
            else:
                logger.info("Chrome is not running, starting fresh...")
            
            logger.info("Opening Chrome using terminal with debugging enabled...")
            
            # Open terminal
            logger.info("Opening terminal...")
            pyautogui.hotkey('ctrl', 'alt', 't')
            time.sleep(2)
            
            # Type the Chrome command with anti-detection flags
            # Use nohup and & to run in background so terminal can be closed
            chrome_command = "nohup google-chrome --no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu --user-data-dir=/home/desktop/.config/google-chrome-docker --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --no-first-run --no-default-browser-check --disable-features=ChromeWhatsNewUI,PrivacySandboxSettings4,InterestFeedContentSuggestions,IsolateOrigins,site-per-process --disable-infobars --disable-session-crashed-bubble --disable-translate --start-maximized --disable-default-apps --disable-component-update --disable-blink-features=AutomationControlled --exclude-switches=enable-automation --user-agent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' > /dev/null 2>&1 &"
            
            logger.info("Typing Chrome command with debugging flags...")
            pyautogui.typewrite(chrome_command, interval=0.01)
            time.sleep(0.5)
            
            # Press Enter to execute
            logger.info("Executing Chrome command...")
            pyautogui.press('enter')
            
            # Wait a moment for the command to register
            time.sleep(2)
            
            # Extra wait for Chrome to fully start
            logger.info("Waiting for Chrome to fully start...")
            time.sleep(3)
            
            logger.info("Chrome launch completed, checking status...")
            
            # Check if debugging port is available
            import socket
            max_attempts = 10
            chrome_connected = False
            
            for attempt in range(max_attempts):
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                result = sock.connect_ex(('localhost', 9222))
                sock.close()
                
                if result == 0:
                    logger.info(f"Chrome debugging port is ready!")
                    chrome_connected = True
                    break
                
                if attempt < max_attempts - 1:
                    logger.info(f"Waiting for Chrome debugging port... attempt {attempt + 1}/{max_attempts}")
                    time.sleep(1)
            
            if chrome_connected:
                # Connect to Chrome for automation
                logger.info("Connecting to Chrome for automation...")
                return await self.connect_to_browser()
            else:
                # Check if Chrome process is at least running
                chrome_running = os.system("pgrep -f chrome > /dev/null 2>&1") == 0
                
                if chrome_running:
                    logger.warning("Chrome is running but debugging port is not accessible")
                    return {
                        "success": False,
                        "error": "Chrome started but debugging port is not accessible. Please check Chrome configuration."
                    }
                else:
                    logger.error("Chrome process not detected")
                    return {
                        "success": False,
                        "error": "Chrome did not start. Please check if Chrome is installed."
                    }
            
        except Exception as e:
            logger.error(f"Error opening and connecting to browser: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def connect_to_browser(self) -> Dict[str, Any]:
        """Connect to Chrome browser using Stealth mode for anti-detection"""
        try:
            # First check if Chrome is running with DevTools
            try:
                response = requests.get(f"{self.chrome_devtools_url}/json/version", timeout=2)
                if response.status_code == 200:
                    logger.info("Chrome DevTools is accessible")
            except:
                return {
                    "success": False,
                    "error": "Chrome is not running with remote debugging. Please start Chrome with --remote-debugging-port=9222"
                }
            
            # Use StealthBrowser if available for anti-detection
            if STEALTH_AVAILABLE and self.browser_manager:
                try:
                    # Create stealth browser instance
                    self.stealth_browser = StealthBrowser(headless=False)
                    # Connect to existing Chrome instance with stealth
                    self.driver = self.stealth_browser.connect_to_existing(port=9222)
                    logger.info("Connected to Chrome using Stealth mode (anti-detection enabled)")
                except Exception as stealth_error:
                    logger.warning(f"Stealth connection failed, falling back to standard: {stealth_error}")
                    # Fallback to standard connection
                    chrome_options = ChromeOptions()
                    # Use debugger_address attribute for better compatibility
                    chrome_options.debugger_address = "127.0.0.1:9222"
                    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
                    self.driver = webdriver.Chrome(options=chrome_options)
                    logger.info("Connected using fallback mode with basic anti-detection")
            else:
                # Standard connection with basic anti-detection
                chrome_options = ChromeOptions()
                # Use debugger_address attribute for better compatibility
                chrome_options.debugger_address = "127.0.0.1:9222"
                chrome_options.add_argument('--disable-blink-features=AutomationControlled')
                self.driver = webdriver.Chrome(options=chrome_options)
                logger.info("Connected to existing Chrome instance (standard mode)")
            
            # Get current tab info
            current_url = self.driver.current_url
            title = self.driver.title
            
            return {
                "success": True,
                "message": "Connected to Chrome browser with anti-detection",
                "current_url": current_url,
                "title": title,
                "tabs": len(self.driver.window_handles),
                "stealth_mode": STEALTH_AVAILABLE
            }
        except Exception as e:
            logger.error(f"Failed to connect to Chrome: {e}")
            return {
                "success": False,
                "error": f"Failed to connect to Chrome: {str(e)}"
            }
                
        except Exception as e:
            logger.error(f"Error in browser connection: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def get_browser_dom_elements(self) -> Dict[str, Any]:
        """Get only text-bearing DOM elements in a clean hierarchical structure"""
        try:
            if not self.driver:
                # Try to connect first
                logger.info("No driver found, attempting to connect to browser...")
                connect_result = await self.connect_to_browser()
                if not connect_result.get("success"):
                    logger.error(f"Failed to connect to browser: {connect_result.get('error')}")
                    return connect_result
                logger.info("Successfully connected to browser")

            # Log current page info
            try:
                current_url = self.driver.current_url
                page_title = self.driver.title
                logger.info(f"Getting DOM from page: {current_url} - Title: {page_title}")
            except Exception as e:
                logger.warning(f"Could not get page info: {e}")

            # First, let's test with a simple JavaScript to ensure execution works
            test_js = """
                const elements = document.querySelectorAll('h1, h2, h3, p, a, button, input');
                return { 
                    test: 'working', 
                    url: window.location.href, 
                    title: document.title,
                    elementCount: elements.length,
                    bodyExists: !!document.body,
                    bodyChildren: document.body ? document.body.children.length : 0
                };
            """
            try:
                test_result = self.driver.execute_script(test_js)
                logger.info(f"Test JS worked: {test_result}")
                if test_result.get('elementCount', 0) == 0:
                    logger.warning("No basic elements found - page might be dynamic or not loaded")
            except Exception as test_error:
                logger.error(f"Even simple JS failed: {test_error}")
                return {
                    "success": False,
                    "error": f"Browser JavaScript execution not working: {str(test_error)}"
                }

            # Try a simpler approach first
            simple_js = """
            try {
                const allElements = [];
                const textElements = [];
                const actionableElements = [];
                
                // Get all visible text elements
                const textSelectors = 'h1, h2, h3, h4, h5, h6, p, span, div, li, td, th, label';
                document.querySelectorAll(textSelectors).forEach(el => {
                    const text = (el.innerText || el.textContent || '').trim();
                    if (text && text.length > 1) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            textElements.push({
                                tag: el.tagName.toLowerCase(),
                                text: text.substring(0, 200),
                                id: el.id || null,
                                class: el.className || null
                            });
                        }
                    }
                });
                
                // Get actionable elements
                const actionSelectors = 'a, button, input, select, textarea, [onclick], [role="button"]';
                document.querySelectorAll(actionSelectors).forEach(el => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        const text = (el.innerText || el.textContent || el.value || el.placeholder || '').trim();
                        actionableElements.push({
                            tag: el.tagName.toLowerCase(),
                            type: el.type || null,
                            text: text.substring(0, 100),
                            href: el.href || null,
                            id: el.id || null,
                            class: el.className || null
                        });
                    }
                });
                
                return {
                    url: window.location.href,
                    title: document.title,
                    viewport: { width: window.innerWidth, height: window.innerHeight },
                    text_elements: textElements.slice(0, 100), // Limit to first 100
                    actionable_elements: actionableElements.slice(0, 50), // Limit to first 50
                    summary: {
                        total_text: textElements.length,
                        total_actionable: actionableElements.length,
                        method: 'simple'
                    },
                    timestamp: new Date().toISOString()
                };
            } catch (error) {
                return {
                    url: window.location.href,
                    title: document.title,
                    error: error.toString(),
                    summary: { error: true }
                };
            }
            """
            
            # Try simple extraction first
            logger.info("Trying simple DOM extraction...")
            try:
                simple_result = self.driver.execute_script(simple_js)
                if simple_result and simple_result.get('summary', {}).get('total_text', 0) > 0:
                    logger.info(f"Simple extraction successful: {simple_result.get('summary')}")
                    # Return simplified structure compatible with expected format
                    return {
                        "success": True,
                        "page_info": {
                            "url": simple_result.get('url'),
                            "title": simple_result.get('title'),
                            "viewport": simple_result.get('viewport')
                        },
                        "hierarchy": None,  # Not available in simple mode
                        "interactive_groups": {},
                        "actionable_elements": simple_result.get('actionable_elements', []),
                        "text_elements": simple_result.get('text_elements', []),
                        "selector_map": {},
                        "summary": simple_result.get('summary', {}),
                        "timestamp": simple_result.get('timestamp')
                    }
            except Exception as simple_error:
                logger.warning(f"Simple extraction failed: {simple_error}, trying complex method...")
            
            # JavaScript to extract only text-bearing elements hierarchically
            js_code = """
    function getTextOnlyHierarchy() {
        try {
        console.log('Starting getTextOnlyHierarchy function');
        const viewport = { width: window.innerWidth, height: window.innerHeight };
        let elementIdCounter = 0;
        
        // Quick test to see if we can access DOM
        const testElements = document.querySelectorAll('*');
        console.log('Found total elements on page:', testElements.length);

        // Helper to check if element is visible (more lenient)
        function isVisible(el) {
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            // Allow elements with any positive dimension
            if (rect.width <= 0 && rect.height <= 0) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') {
                return false;
            }
            // Don't require viewport check - get all visible elements on page
            return true;
        }
        
        // Helper to check if element has meaningful text
        function hasMeaningfulText(el) {
            const text = el.innerText?.trim() || '';
            return text && text.length >= 2; // Allow shorter text
        }

        // Helper to get unique CSS selector with uniqueness check
        function getUniqueSelector(el) {
            let selector = '';
            let current = el;
            while (current && current !== document) {
                let part = current.tagName.toLowerCase();
                if (current.id && !current.id.match(/^[0-9]/)) {
                    part = '#' + CSS.escape(current.id);
                } else {
                    let classes = [];
                    if (current.className) {
                        let classString = typeof current.className === 'string' ? current.className : (current.className.baseVal || '');
                        if (classString) {
                            classes = classString.trim().split(/\s+/).filter(c => c && !c.includes(':') && !c.match(/^[a-z0-9]{8,}$/i) && !c.match(/^js-/) && !c.match(/^is-/) && !c.match(/^has-/));
                            if (classes.length > 0) {
                                part += classes.slice(0, 2).map(c => '.' + CSS.escape(c)).join('');
                            }
                        }
                    }
                    const dataTestId = current.getAttribute('data-testid');
                    if (dataTestId) {
                        part += '[data-testid="' + dataTestId + '"]';
                    } else if (current.name) {
                        // Use name attribute if available  
                        part = current.tagName.toLowerCase() + '[name="' + current.name + '"]';
                    }
                    if (current.parentElement) {
                        const siblings = Array.from(current.parentElement.children).filter(s => s.tagName === current.tagName);
                        if (siblings.length > 1) {
                            const index = siblings.indexOf(current) + 1;
                            part += ':nth-of-type(' + index + ')';
                        }
                    }
                }
                selector = part + (selector ? ' > ' + selector : '');
                if (document.querySelectorAll(selector).length === 1) {
                    return selector;
                }
                current = current.parentElement;
            }
            return selector;
        }

        // Helper to get fallback XPath
        function getXPathSelector(el) {
            if (el.id) {
                return '//*[@id="' + el.id + '"]';
            }
            const path = [];
            let current = el;
            while (current && current !== document.documentElement) {
                let index = 0;
                let sibling = current.previousSibling;
                while (sibling) {
                    if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) {
                        index++;
                    }
                    sibling = sibling.previousSibling;
                }
                const tagName = current.tagName.toLowerCase();
                const pathIndex = index > 0 ? '[' + (index + 1) + ']' : '';
                path.unshift(tagName + pathIndex);
                current = current.parentElement;
            }
            return '//' + path.join('/');
        }

        // Helper to identify container patterns, including product cards
        function identifyContainerPattern(el) {
            const tagName = el.tagName.toLowerCase();
            let classes = '';
            if (el.className) {
                classes = typeof el.className === 'string' ? el.className.toLowerCase() : (el.className.baseVal || '').toLowerCase();
            }
            const role = el.getAttribute('role');
            const dataTestId = el.getAttribute('data-testid');
            // Product patterns
            if (classes.includes('product') || classes.includes('item') || classes.includes('card') || dataTestId?.includes('product')) {
                return 'product_card';
            }
            // Other patterns
            if (tagName === 'nav' || role === 'navigation' || classes.includes('nav')) return 'navigation';
            if (tagName === 'form') return 'form';
            if (tagName === 'ul' || tagName === 'ol' || role === 'list') return 'list';
            if (classes.includes('grid') || classes.includes('gallery')) return 'grid';
            if (role === 'dialog' || classes.includes('modal') || classes.includes('popup')) return 'modal';
            if (tagName === 'header' || role === 'banner') return 'header';
            if (tagName === 'footer' || role === 'contentinfo') return 'footer';
            if (tagName === 'main' || role === 'main') return 'main_content';
            if (tagName === 'article' || classes.includes('post') || classes.includes('article')) return 'article';
            if (tagName === 'section') return 'section';
            if (tagName === 'aside') return 'sidebar';
            if (tagName === 'div' && el.children.length > 2) return 'container';
            return null;
        }

        // Helper to get direct text content
        function getDirectText(el) {
            if (!el || !el.childNodes) return '';
            let text = '';
            const childNodes = Array.from(el.childNodes);
            for (let node of childNodes) {
                if (node && node.nodeType === Node.TEXT_NODE) {
                    const nodeText = node.textContent ? node.textContent.trim() : '';
                    if (nodeText) text += nodeText + ' ';
                }
            }
            return text.trim().substring(0, 200); // Reduced for conciseness
        }

        // Helper to determine element category
        function getElementCategory(el, tagName) {
            const role = el.getAttribute('role');
            const type = el.type;
            if (tagName === 'button' || role === 'button') return 'button';
            if (tagName === 'a') return 'link';
            if (tagName === 'input') {
                if (type === 'submit' || type === 'button') return 'button';
                if (type === 'text' || type === 'email' || type === 'password') return 'text_input';
                if (type === 'checkbox') return 'checkbox';
                if (type === 'radio') return 'radio';
                return 'input';
            }
            if (tagName === 'textarea') return 'text_input';
            if (tagName === 'select') return 'select';
            if (tagName === 'img') return 'image';
            if (tagName === 'video') return 'video';
            if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3') return 'heading';
            if (tagName === 'p') return 'paragraph';
            if (tagName === 'span' || tagName === 'label') return 'text';
            if (tagName === 'ul' || tagName === 'ol') return 'list';
            if (tagName === 'li') return 'list_item';
            if (tagName === 'table') return 'table';
            if (tagName === 'tr') return 'table_row';
            if (tagName === 'td' || tagName === 'th') return 'table_cell';
            if (tagName === 'div' || tagName === 'section' || tagName === 'article') {
                return el.children.length > 0 ? 'container' : 'element';
            }
            return 'element';
        }

        // Build element info with hierarchy tracking
        function buildElementInfo(el, parentId = null, depth = 0) {
            if (!el) return null;
            if (depth > 20) return null; // Reduced depth limit for conciseness
            
            const tagName = el.tagName.toLowerCase();
            if (['script', 'style', 'meta', 'link', 'noscript'].includes(tagName)) return null;
            
            const rect = el.getBoundingClientRect();
            
            // Be more lenient for body and major containers
            if (tagName !== 'body' && tagName !== 'html' && tagName !== 'main' && tagName !== 'div') {
                // Only check visibility for non-container elements
                if (!isVisible(el)) return null;
            }
            const elementId = `elem_${++elementIdCounter}`;
            const computedStyle = window.getComputedStyle(el);
            const directText = getDirectText(el);
            const containerPattern = identifyContainerPattern(el);
            const category = getElementCategory(el, tagName);
            const isInteractive = ['button', 'link', 'input', 'text_input', 'checkbox', 'radio', 'select'].includes(category) ||
                                el.onclick !== null || el.getAttribute('tabindex') !== null || computedStyle.cursor === 'pointer';
            const elementInfo = {
                element_id: elementId,
                parent_id: parentId,
                depth: depth,
                category: category,
                container_pattern: containerPattern,
                tag: tagName,
                type: el.type || null,
                id: el.id || null,
                class: typeof el.className === 'string' ? el.className : (el.className?.baseVal || null),
                name: el.name || null,
                text: directText || el.innerText?.trim().substring(0, 200) || null, // Reduced for conciseness
                direct_text: directText,
                value: el.value || null,
                href: el.href || null,
                src: el.src || null,
                alt: el.alt || null,
                placeholder: el.placeholder || null,
                aria_label: el.getAttribute('aria-label'),
                role: el.getAttribute('role'),
                title: el.title || null,
                data_testid: el.getAttribute('data-testid'),
                position: {
                    x: Math.round(rect.x),
                    y: Math.round(rect.y),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    top: Math.round(rect.top),
                    bottom: Math.round(rect.bottom),
                    left: Math.round(rect.left),
                    right: Math.round(rect.right)
                },
                computed_style: {
                    color: computedStyle.color,
                    backgroundColor: computedStyle.backgroundColor,
                    fontSize: computedStyle.fontSize,
                    fontWeight: computedStyle.fontWeight,
                    cursor: computedStyle.cursor,
                    display: computedStyle.display,
                    position: computedStyle.position
                },
                is_interactive: isInteractive,
                is_container: el.children.length > 0,
                children_count: el.children.length,
                selector: getUniqueSelector(el),
                xpath: getXPathSelector(el),
                children: []
            };

            // Process children
            for (let child of el.children) {
                const childInfo = buildElementInfo(child, elementId, depth + 1);
                if (childInfo) {
                    elementInfo.children.push(childInfo);
                }
            }

            // Handle shadow DOM
            if (el.shadowRoot) {
                for (let child of el.shadowRoot.children) {
                    const childInfo = buildElementInfo(child, elementId, depth + 1);
                    if (childInfo) {
                        elementInfo.children.push(childInfo);
                    }
                }
            }

            return elementInfo;
        }

        console.log('Starting to build hierarchy from document.body:', document.body);
        const hierarchy = buildElementInfo(document.body, null, 0);
        console.log('Built hierarchy:', hierarchy);

        // If hierarchy is null, try with a simpler approach
        if (!hierarchy) {
            console.log('Hierarchy was null, creating minimal structure');
            // Return at least basic page info
            return {
                url: window.location.href,
                title: document.title,
                viewport: viewport,
                hierarchy: { text: 'Page body not accessible', tag: 'body' },
                interactive_groups: {},
                actionable_elements: [],
                text_elements: [],
                selector_map: {},
                summary: { total_elements: 0, error: 'Could not build hierarchy' },
                timestamp: new Date().toISOString()
            };
        }

        // Flatten for summary
        function flattenHierarchy(node, flat = []) {
            if (!node) return flat;
            const nodeCopy = { ...node };
            delete nodeCopy.children;
            flat.push(nodeCopy);
            if (node.children && node.children.length > 0) {
                for (let child of node.children) {
                    flattenHierarchy(child, flat);
                }
            }
            return flat;
        }
        const flatElements = flattenHierarchy(hierarchy);

        const summary = {
            total_elements: flatElements.length,
            text_elements: flatElements.filter(e => e.text).length,
            interactive_elements: flatElements.filter(e => e.is_interactive).length,
            buttons: flatElements.filter(e => e.category === 'button').length,
            links: flatElements.filter(e => e.category === 'link').length,
            inputs: flatElements.filter(e => ['text_input', 'input', 'checkbox', 'radio'].includes(e.category)).length,
            container_types: [...new Set(flatElements.map(e => e.container_pattern).filter(Boolean))]
        };

        // Create simplified hierarchy with aggressive pruning and grouping
        function createSimplifiedHierarchy(node, parentText = '', depth = 0) {
            if (!node || depth > 20) return null;
            const directText = node.direct_text || '';
            const hasDirectText = directText.trim().length > 0;
            const isInteractive = node.is_interactive;
            const isSignificant = node.category !== 'container' && node.category !== 'element';
            const childResults = [];
            let childTexts = new Set();
            if (node.children && node.children.length > 0) {
                for (let child of node.children) {
                    const simplifiedChild = createSimplifiedHierarchy(child, directText || parentText, depth + 1);
                    if (simplifiedChild) {
                        if (simplifiedChild.text) childTexts.add(simplifiedChild.text);
                        childResults.push(simplifiedChild);
                    }
                }
            }
            // Prune non-meaningful nodes
            if (!isInteractive && !isSignificant && hasDirectText && directText.length < 5) return null;
            const shouldInclude = hasDirectText || isInteractive || isSignificant || childResults.length > 0;
            if (!shouldInclude) return null;
            // Collapse single child containers
            if (node.category === 'container' && !hasDirectText && !isInteractive && childResults.length === 1) {
                return childResults[0];
            }
            let nodeText = node.text ? node.text.trim() : '';
            if (nodeText && childTexts.size > 0) {
                const combinedChildText = Array.from(childTexts).join(' ').trim();
                if (nodeText === combinedChildText || nodeText.includes(combinedChildText)) {
                    nodeText = directText;
                }
            }
            if (!nodeText && !isInteractive && childResults.length === 0) return null;
            const simplifiedNode = {};
            if (nodeText.trim().length > 0) {
                simplifiedNode.text = nodeText.substring(0, 150).trim(); // Reduced for conciseness
            }
            // Set type to container_pattern if available for better grouping
            const effectiveType = node.container_pattern || node.category;
            if (isSignificant || isInteractive) {
                simplifiedNode.type = effectiveType;
            }
            if (nodeText || isInteractive) {
                simplifiedNode.selector = node.selector;
                simplifiedNode.xpath = node.xpath;
            }
            if (isInteractive) {
                simplifiedNode.interactive = true;
                if (node.href) simplifiedNode.href = node.href;
                if (node.aria_label) simplifiedNode.aria_label = node.aria_label;
                if (node.placeholder) simplifiedNode.placeholder = node.placeholder;
            }
            if (childResults.length > 0) {
                const childTypes = new Set(childResults.map(c => c.type).filter(Boolean));
                if (childTypes.size === 1 && node.category === 'container') {
                    simplifiedNode.type = Array.from(childTypes)[0] + '_group';
                }
                // Limit children for large groups to shorten output
                if (childResults.length > 10 && (simplifiedNode.type?.includes('_group') || node.container_pattern === 'list' || node.container_pattern === 'grid')) {
                    const limitedChildren = childResults.slice(0, 5);
                    limitedChildren.push({
                        type: 'placeholder',
                        text: `... and ${childResults.length - 5} more similar items`
                    });
                    simplifiedNode.children = limitedChildren;
                } else {
                    simplifiedNode.children = childResults;
                }
            }
            if (Object.keys(simplifiedNode).length === 0) return null;
            return simplifiedNode;
        }
        const simplifiedHierarchy = createSimplifiedHierarchy(hierarchy);

        // Group interactive elements by context
        const interactiveGroups = {};
        function groupInteractiveElements(node, context = 'Page', depth = 0) {
            if (!node) return;
            if (node.interactive && node.text) {
                const groupName = context || 'Page';
                if (!interactiveGroups[groupName]) interactiveGroups[groupName] = [];
                interactiveGroups[groupName].push({ text: node.text, type: node.type, selector: node.selector, href: node.href });
            }
            let childContext = context;
            if (node.text && node.text.length > 5 && node.text.length < 50 && depth < 3) {
                childContext = node.text;
            }
            if (node.children) {
                for (let child of node.children) {
                    groupInteractiveElements(child, childContext, depth + 1);
                }
            }
        }
        groupInteractiveElements(simplifiedHierarchy);

        // Extract actionable and text elements with improved context (breadcrumb)
        const actionableElements = [];
        const textElements = [];
        const seenSelectors = new Set();
        let actionId = 0;
        let textId = 0;
        function extractElements(node, context = '', parentType = '') {
            if (!node) return;
            if (node.interactive && node.selector && !seenSelectors.has(node.selector)) {
                seenSelectors.add(node.selector);
                actionId++;
                actionableElements.push({
                    id: 'action_' + actionId,
                    selector: node.selector,
                    xpath: node.xpath,
                    type: node.type,
                    text: node.text || node.aria_label || node.placeholder || '',
                    context: context,
                    href: node.href
                });
            }
            if (node.text && !node.interactive && node.selector && !seenSelectors.has(node.selector)) {
                seenSelectors.add(node.selector);
                textId++;
                textElements.push({
                    id: 'text_' + textId,
                    selector: node.selector,
                    xpath: node.xpath,
                    text: node.text,
                    context: context,
                    parent_type: parentType
                });
            }
            if (node.children) {
                let newContext = context;
                if (node.text && node.text.length < 30) { // Shorter for breadcrumbs
                    newContext = context ? context + ' > ' + node.text : node.text;
                }
                const newParentType = node.type || parentType;
                for (let child of node.children) {
                    extractElements(child, newContext, newParentType);
                }
            }
        }
        extractElements(simplifiedHierarchy);

        // Create selector map
        const selectorMap = {};
        actionableElements.forEach(elem => {
            selectorMap[elem.id] = { css: elem.selector, xpath: elem.xpath, text: elem.text, type: 'action' };
        });
        textElements.forEach(elem => {
            selectorMap[elem.id] = { css: elem.selector, xpath: elem.xpath, text: elem.text, type: 'text' };
        });

        return {
            url: window.location.href,
            title: document.title,
            viewport: viewport,
            hierarchy: simplifiedHierarchy,
            interactive_groups: interactiveGroups,
            actionable_elements: actionableElements,
            text_elements: textElements,
            selector_map: selectorMap,
            summary: summary,
            timestamp: new Date().toISOString()
        };
        } catch (error) {
            console.error('Error in getTextOnlyHierarchy:', error);
            return {
                url: window.location.href,
                title: document.title,
                viewport: { width: window.innerWidth, height: window.innerHeight },
                error: error.toString(),
                hierarchy: null,
                interactive_groups: {},
                actionable_elements: [],
                text_elements: [],
                selector_map: {},
                summary: { total_elements: 0, error: true },
                timestamp: new Date().toISOString()
            };
        }
    }
    return getTextOnlyHierarchy();
            """

            # Execute JavaScript to get hierarchical DOM
            logger.info("Executing JavaScript to extract DOM...")
            try:
                result = self.driver.execute_script(js_code)
                logger.info(f"JavaScript execution completed. Result type: {type(result)}")
                
                if result is None:
                    logger.error("JavaScript returned None - likely a syntax error in the JS code")
                    return {
                        "success": False,
                        "error": "JavaScript execution returned no data - possible syntax error"
                    }
                
                if not isinstance(result, dict):
                    logger.error(f"JavaScript returned unexpected type: {type(result)}")
                    return {
                        "success": False,
                        "error": f"JavaScript returned unexpected data type: {type(result)}"
                    }
                
                # Log what we got back
                logger.info(f"DOM extraction successful. Found {result.get('summary', {}).get('total_elements', 0)} elements")
                
                # Return the clean, hierarchical structure
                return {
                    "success": True,
                    "page_info": {
                        "url": result.get('url'),
                        "title": result.get('title'),
                        "viewport": result.get('viewport')
                    },
                    "hierarchy": result.get('hierarchy'),
                    "interactive_groups": result.get('interactive_groups'),
                    "actionable_elements": result.get('actionable_elements'),
                    "text_elements": result.get('text_elements'),
                    "selector_map": result.get('selector_map'),
                    "summary": result.get('summary'),
                    "timestamp": result.get('timestamp')
                }
            except Exception as js_error:
                logger.error(f"JavaScript execution error: {js_error}")
                logger.error(f"Error type: {type(js_error).__name__}")
                return {
                    "success": False,
                    "error": f"JavaScript execution failed: {str(js_error)}"
                }
        except Exception as e:
            logger.error(f"Failed to get DOM elements: {e}")
            logger.error(f"Error type: {type(e).__name__}")
            return {
                "success": False,
                "error": f"Failed to get DOM elements: {str(e)}"
            }
    
    async def browser_get_clickables(self) -> Dict[str, Any]:
        """Get ONLY clickable elements from the browser (buttons, links, inputs, etc.)"""
        try:
            if not self.driver:
                # Try to connect first
                connect_result = await self.connect_to_browser()
                if not connect_result.get("success"):
                    return connect_result

            # JavaScript to extract only clickable elements
            js_code = """
    function getClickableElements() {
        const viewport = { width: window.innerWidth, height: window.innerHeight };
        const clickables = [];
        const seenSelectors = new Set();
        let elementId = 0;
        
        // First, detect if there's a modal/popup/overlay present
        function detectModalOrOverlay() {
            // Common selectors for modals and overlays
            const modalSelectors = [
                '[role="dialog"]',
                '[role="alertdialog"]',
                '[aria-modal="true"]',
                '.modal:not(.hidden):not(.hide)',
                '.popup:not(.hidden):not(.hide)',
                '.overlay:not(.hidden):not(.hide)',
                '.dialog:not(.hidden):not(.hide)',
                '[data-testid*="modal"]',
                '[data-testid*="dialog"]',
                '[class*="modal"]:not([class*="hidden"])',
                '[class*="popup"]:not([class*="hidden"])',
                '[class*="overlay"]:not([class*="hidden"])',
                '[class*="dialog"]:not([class*="hidden"])',
                '.MuiDialog-root',
                '.ant-modal-wrap:not(.ant-modal-wrap-hidden)',
                '.el-dialog__wrapper:not(.hidden)',
                '[class*="Modal"]:not([class*="hidden"])',
                '[class*="Popup"]:not([class*="hidden"])',
                'div[style*="z-index: 9"][style*="position: fixed"]',
                'div[style*="z-index: 10"][style*="position: fixed"]'
            ];
            
            // Check for high z-index elements that cover the screen
            const allElements = document.querySelectorAll('*');
            let modalElement = null;
            let highestZIndex = 0;
            
            // First try common modal selectors
            for (const selector of modalSelectors) {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    const style = window.getComputedStyle(el);
                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                        const zIndex = parseInt(style.zIndex) || 0;
                        if (zIndex > highestZIndex || !modalElement) {
                            // Check if it's actually visible and covers significant area
                            const rect = el.getBoundingClientRect();
                            if (rect.width > 100 && rect.height > 100) {
                                modalElement = el;
                                highestZIndex = zIndex;
                            }
                        }
                    }
                }
            }
            
            // If no modal found, check for high z-index overlays
            if (!modalElement) {
                for (const el of allElements) {
                    const style = window.getComputedStyle(el);
                    const zIndex = parseInt(style.zIndex) || 0;
                    
                    // Look for elements with high z-index that are positioned
                    if (zIndex >= 999 && (style.position === 'fixed' || style.position === 'absolute')) {
                        const rect = el.getBoundingClientRect();
                        // Check if it covers a significant portion of the viewport
                        if (rect.width > viewport.width * 0.3 && rect.height > viewport.height * 0.3) {
                            if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                                modalElement = el;
                                highestZIndex = zIndex;
                                break;
                            }
                        }
                    }
                }
            }
            
            return modalElement;
        }
        
        // Helper to check if element is visible and not blocked by modal
        function isVisible(el, modalElement = null) {
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                return false;
            }
            const inViewport = rect.top < viewport.height && rect.bottom > 0 && 
                              rect.left < viewport.width && rect.right > 0;
            
            // If we have a modal, check if element is within or above the modal
            if (modalElement && inViewport) {
                // Check if element is a child of the modal
                if (modalElement.contains(el)) {
                    return true;
                }
                // Check z-index to see if element is above modal
                const elZIndex = parseInt(window.getComputedStyle(el).zIndex) || 0;
                const modalZIndex = parseInt(window.getComputedStyle(modalElement).zIndex) || 0;
                if (elZIndex > modalZIndex) {
                    return true;
                }
                // Otherwise, element is behind modal
                return false;
            }
            
            return inViewport;
        }
        
        // Helper to get unique CSS selector
        function getUniqueSelector(el) {
            let selector = '';
            let current = el;
            while (current && current !== document) {
                let part = current.tagName.toLowerCase();
                if (current.id && !current.id.match(/^[0-9]/)) {
                    part = '#' + CSS.escape(current.id);
                } else {
                    let classes = [];
                    if (current.className) {
                        let classString = typeof current.className === 'string' ? 
                                        current.className : (current.className.baseVal || '');
                        if (classString) {
                            classes = classString.trim().split(/\s+/)
                                    .filter(c => c && !c.includes(':') && 
                                           !c.match(/^[a-z0-9]{8,}$/i) && 
                                           !c.match(/^js-/) && !c.match(/^is-/) && 
                                           !c.match(/^has-/));
                            if (classes.length > 0) {
                                part += classes.slice(0, 2).map(c => '.' + CSS.escape(c)).join('');
                            }
                        }
                    }
                    const dataTestId = current.getAttribute('data-testid');
                    if (dataTestId) {
                        part += '[data-testid="' + dataTestId + '"]';
                    } else if (current.name) {
                        // Use name attribute if available
                        part = current.tagName.toLowerCase() + '[name="' + current.name + '"]';
                    }
                    if (current.parentElement) {
                        const siblings = Array.from(current.parentElement.children)
                                       .filter(s => s.tagName === current.tagName);
                        if (siblings.length > 1) {
                            const index = siblings.indexOf(current) + 1;
                            part += ':nth-of-type(' + index + ')';
                        }
                    }
                }
                selector = part + (selector ? ' > ' + selector : '');
                if (document.querySelectorAll(selector).length === 1) {
                    return selector;
                }
                current = current.parentElement;
            }
            return selector;
        }
        
        // Helper to get XPath
        function getXPathSelector(el) {
            if (el.id) {
                return '//*[@id="' + el.id + '"]';
            }
            const path = [];
            let current = el;
            while (current && current !== document.documentElement) {
                let index = 0;
                let sibling = current.previousSibling;
                while (sibling) {
                    if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) {
                        index++;
                    }
                    sibling = sibling.previousSibling;
                }
                const tagName = current.tagName.toLowerCase();
                const pathIndex = index > 0 ? '[' + (index + 1) + ']' : '';
                path.unshift(tagName + pathIndex);
                current = current.parentElement;
            }
            return '//' + path.join('/');
        }
        
        // Helper to get element text
        function getElementText(el) {
            // First try direct text content
            let text = el.innerText || el.textContent || '';
            text = text.trim();
            
            // For inputs, get value or placeholder
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                text = el.value || el.placeholder || text;
            }
            
            // For links, include link text
            if (el.tagName === 'A') {
                text = el.innerText || el.textContent || el.title || text;
            }
            
            // Get aria-label as fallback
            if (!text) {
                text = el.getAttribute('aria-label') || '';
            }
            
            // Limit text length
            return text.substring(0, 100);
        }
        
        // Helper to get surrounding context
        function getContext(el) {
            let context = '';
            
            // Try to get parent's text (like label or surrounding div)
            if (el.parentElement) {
                const parentText = el.parentElement.innerText || '';
                if (parentText && parentText.length < 200) {
                    context = parentText.substring(0, 50);
                }
            }
            
            // Look for associated label
            if (el.id) {
                const label = document.querySelector('label[for="' + el.id + '"]');
                if (label) {
                    context = label.innerText || label.textContent || context;
                }
            }
            
            return context.substring(0, 50);
        }
        
        // Detect if there's a modal present
        const modalElement = detectModalOrOverlay();
        const hasModal = modalElement !== null;
        
        // Collect all clickable elements
        const clickableSelectors = [
            'button',
            'a[href]',
            'input[type="button"]',
            'input[type="submit"]',
            'input[type="checkbox"]',
            'input[type="radio"]',
            'input[type="text"]',
            'input[type="email"]',
            'input[type="password"]',
            'input[type="search"]',
            'input[type="tel"]',
            'input[type="url"]',
            'input[type="number"]',
            'input[type="date"]',
            'input[type="file"]',
            'select',
            'textarea',
            '[role="button"]',
            '[role="link"]',
            '[role="checkbox"]',
            '[role="radio"]',
            '[role="menuitem"]',
            '[role="tab"]',
            '[onclick]',
            '[data-action]',
            '.btn',
            '.button'
        ];
        
        // If modal is present, focus on elements within the modal first
        let elementsToProcess = [];
        
        if (hasModal) {
            // First, get all clickable elements within the modal
            clickableSelectors.forEach(selector => {
                const modalClickables = modalElement.querySelectorAll(selector);
                modalClickables.forEach(el => {
                    if (isVisible(el, modalElement)) {
                        elementsToProcess.push({element: el, inModal: true});
                    }
                });
            });
            
            // Also check for close buttons or overlays that might be outside but related to modal
            const closeButtons = document.querySelectorAll('[aria-label*="close"], [aria-label*="Close"], [title*="close"], [title*="Close"], .close, .modal-close, [class*="close"]');
            closeButtons.forEach(el => {
                if (isVisible(el, modalElement)) {
                    elementsToProcess.push({element: el, inModal: true});
                }
            });
        } else {
            // No modal, get all visible clickable elements
            clickableSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    if (isVisible(el)) {
                        elementsToProcess.push({element: el, inModal: false});
                    }
                });
            });
        }
        
        // Process collected elements
        elementsToProcess.forEach(item => {
            const el = item.element;
            if (!el) return;
                
                const uniqueSelector = getUniqueSelector(el);
                if (seenSelectors.has(uniqueSelector)) return;
                seenSelectors.add(uniqueSelector);
                
                elementId++;
                const rect = el.getBoundingClientRect();
                
                // Determine element type
                let elementType = el.tagName.toLowerCase();
                if (el.getAttribute('role')) {
                    elementType = el.getAttribute('role');
                } else if (el.type) {
                    elementType = el.type;
                } else if (el.tagName === 'A') {
                    elementType = 'link';
                } else if (el.tagName === 'BUTTON' || el.type === 'button' || el.type === 'submit') {
                    elementType = 'button';
                }
                
                // Build clickable element info
                const clickableInfo = {
                    id: 'clickable_' + elementId,
                    type: elementType,
                    tag: el.tagName.toLowerCase(),
                    text: getElementText(el),
                    selector: uniqueSelector,
                    xpath: getXPathSelector(el),
                    context: getContext(el),
                    inModal: item.inModal || false,
                    attributes: {
                        href: el.href || null,
                        value: el.value || null,
                        placeholder: el.placeholder || null,
                        'aria-label': el.getAttribute('aria-label'),
                        title: el.title || null,
                        name: el.name || null,
                        id: el.id || null,
                        class: el.className ? 
                               (typeof el.className === 'string' ? el.className : el.className.baseVal) : 
                               null,
                        type: el.type || null,
                        role: el.getAttribute('role'),
                        'data-testid': el.getAttribute('data-testid')
                    },
                    position: {
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                    },
                    visible: true
                };
                
                // Clean up null attributes
                Object.keys(clickableInfo.attributes).forEach(key => {
                    if (clickableInfo.attributes[key] === null || clickableInfo.attributes[key] === '') {
                        delete clickableInfo.attributes[key];
                    }
                });
                
                clickables.push(clickableInfo);
        });
        
        // Sort by position (top to bottom, left to right)
        clickables.sort((a, b) => {
            if (Math.abs(a.position.y - b.position.y) > 10) {
                return a.position.y - b.position.y;
            }
            return a.position.x - b.position.x;
        });
        
        // Create selector map for quick lookup
        const selectorMap = {};
        clickables.forEach(elem => {
            selectorMap[elem.id] = {
                css: elem.selector,
                xpath: elem.xpath,
                text: elem.text,
                type: elem.type
            };
        });
        
        // Group by type for summary
        const summary = {
            total: clickables.length,
            buttons: clickables.filter(e => e.type === 'button' || e.type === 'submit').length,
            links: clickables.filter(e => e.type === 'link' || e.tag === 'a').length,
            inputs: clickables.filter(e => e.tag === 'input' && e.type !== 'button' && e.type !== 'submit').length,
            selects: clickables.filter(e => e.tag === 'select').length,
            textareas: clickables.filter(e => e.tag === 'textarea').length,
            checkboxes: clickables.filter(e => e.type === 'checkbox').length,
            radios: clickables.filter(e => e.type === 'radio').length
        };
        
        return {
            url: window.location.href,
            title: document.title,
            viewport: viewport,
            hasModal: hasModal,
            modalInfo: hasModal ? {
                detected: true,
                clickablesInModal: clickables.filter(c => c.inModal).length,
                message: "Modal/popup detected. Showing only clickable elements from the modal layer."
            } : {
                detected: false,
                message: "No modal detected. Showing all visible clickable elements."
            },
            clickables: clickables,
            selector_map: selectorMap,
            summary: summary,
            timestamp: new Date().toISOString()
        };
    }
    return getClickableElements();
            """

            # Execute JavaScript to get clickable elements
            result = self.driver.execute_script(js_code)

            # Log modal detection status
            if result.get('hasModal'):
                logger.info(f"🚨 Modal/popup detected! Showing {result.get('modalInfo', {}).get('clickablesInModal', 0)} clickables from modal layer only")
            else:
                logger.info(f"✅ No modal detected. Found {result.get('summary', {}).get('total', 0)} total clickable elements")

            # Return the clickable elements
            return {
                "success": True,
                "url": result.get('url'),
                "title": result.get('title'),
                "viewport": result.get('viewport'),
                "hasModal": result.get('hasModal', False),
                "modalInfo": result.get('modalInfo', {}),
                "clickables": result.get('clickables'),
                "selector_map": result.get('selector_map'),
                "summary": result.get('summary'),
                "total": result.get('summary', {}).get('total', 0),
                "timestamp": result.get('timestamp'),
                "message": result.get('modalInfo', {}).get('message', 'Retrieved clickable elements')
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to get clickable elements: {str(e)}"
            }
    
    # Tab Management Functions
    async def browser_list_tabs(self) -> Dict[str, Any]:
        """List all open tabs in the browser"""
        try:
            if not self.driver:
                return {
                    "success": False,
                    "error": "Browser not connected. Use browser_connect first."
                }
            
            current_handle = self.driver.current_window_handle
            all_handles = self.driver.window_handles
            tabs_info = []
            
            for index, handle in enumerate(all_handles):
                # Switch to each tab to get its info
                self.driver.switch_to.window(handle)
                tabs_info.append({
                    "index": index,
                    "handle": handle,
                    "url": self.driver.current_url,
                    "title": self.driver.title,
                    "is_current": handle == current_handle
                })
            
            # Switch back to original tab
            self.driver.switch_to.window(current_handle)
            
            return {
                "success": True,
                "tabs": tabs_info,
                "total_tabs": len(tabs_info),
                "current_tab_index": next(i for i, t in enumerate(tabs_info) if t["is_current"])
            }
            
        except Exception as e:
            logger.error(f"Error listing tabs: {e}")
            return {
                "success": False,
                "error": f"Failed to list tabs: {str(e)}"
            }
    
    async def browser_open_tab(self, url: str = None) -> Dict[str, Any]:
        """Open a new tab and optionally navigate to a URL"""
        try:
            if not self.driver:
                return {
                    "success": False,
                    "error": "Browser not connected. Use browser_connect first."
                }
            
            # Store current tab
            original_handle = self.driver.current_window_handle
            handles_before = set(self.driver.window_handles)
            logger.info(f"Current handles before opening tab: {len(handles_before)}")
            
            # Open new tab using JavaScript
            self.driver.execute_script("window.open('', '_blank');")
            
            # Wait a moment for the tab to open
            await asyncio.sleep(1)
            
            # Get handles after opening tab
            handles_after = self.driver.window_handles
            logger.info(f"Handles after opening tab: {len(handles_after)}")
            
            # Get new tab handle
            new_handles = set(handles_after) - handles_before
            
            if not new_handles:
                # Fallback: Try using keyboard shortcut
                logger.warning("No new handle found, trying keyboard shortcut")
                from selenium.webdriver.common.keys import Keys
                from selenium.webdriver.common.action_chains import ActionChains
                
                actions = ActionChains(self.driver)
                actions.key_down(Keys.CONTROL).send_keys('t').key_up(Keys.CONTROL).perform()
                await asyncio.sleep(1)
                
                handles_after = self.driver.window_handles
                new_handles = set(handles_after) - handles_before
                
            if new_handles:
                new_handle = new_handles.pop()
                # Switch to new tab
                self.driver.switch_to.window(new_handle)
            else:
                # If still no new handle, switch to last handle
                logger.warning("Still no new handle found, switching to last handle")
                if len(self.driver.window_handles) > len(handles_before):
                    new_handle = self.driver.window_handles[-1]
                    self.driver.switch_to.window(new_handle)
                else:
                    return {
                        "success": False,
                        "error": "Failed to open new tab - no new window handle found"
                    }
            
            # Navigate to URL if provided
            if url:
                if not url.startswith(('http://', 'https://')):
                    url = 'https://' + url
                self.driver.get(url)
                
                # Wait for page to load
                try:
                    WebDriverWait(self.driver, 30).until(
                        lambda driver: driver.execute_script("return document.readyState") == "complete"
                    )
                except:
                    logger.warning("Timeout waiting for page load, continuing anyway")
            
            return {
                "success": True,
                "action": "open_tab",
                "new_tab_handle": new_handle if 'new_handle' in locals() else self.driver.current_window_handle,
                "url": self.driver.current_url,
                "title": self.driver.title,
                "total_tabs": len(self.driver.window_handles)
            }
            
        except Exception as e:
            logger.error(f"Error opening new tab: {e}")
            logger.error(f"Error type: {type(e).__name__}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return {
                "success": False,
                "error": f"Failed to open new tab: {str(e)}"
            }
    
    async def browser_close_tab(self, tab_index: int = None) -> Dict[str, Any]:
        """Close a tab by index or current tab if no index provided"""
        try:
            if not self.driver:
                return {
                    "success": False,
                    "error": "Browser not connected. Use browser_connect first."
                }
            
            all_handles = self.driver.window_handles
            
            if len(all_handles) == 1:
                return {
                    "success": False,
                    "error": "Cannot close the last tab. At least one tab must remain open."
                }
            
            current_handle = self.driver.current_window_handle
            
            if tab_index is not None:
                # Close specific tab by index
                if tab_index < 0 or tab_index >= len(all_handles):
                    return {
                        "success": False,
                        "error": f"Invalid tab index {tab_index}. Valid range: 0-{len(all_handles)-1}"
                    }
                
                target_handle = all_handles[tab_index]
                
                # Switch to target tab if not current
                if target_handle != current_handle:
                    self.driver.switch_to.window(target_handle)
                
                # Close the tab
                self.driver.close()
                
                # Switch to another tab if we closed the current one
                remaining_handles = [h for h in all_handles if h != target_handle]
                if remaining_handles:
                    self.driver.switch_to.window(remaining_handles[0])
            else:
                # Close current tab
                self.driver.close()
                
                # Switch to another tab
                remaining_handles = [h for h in all_handles if h != current_handle]
                if remaining_handles:
                    self.driver.switch_to.window(remaining_handles[0])
            
            return {
                "success": True,
                "action": "close_tab",
                "remaining_tabs": len(self.driver.window_handles),
                "current_url": self.driver.current_url,
                "current_title": self.driver.title
            }
            
        except Exception as e:
            logger.error(f"Error closing tab: {e}")
            return {
                "success": False,
                "error": f"Failed to close tab: {str(e)}"
            }
    
    async def browser_switch_tab(self, tab_index: int) -> Dict[str, Any]:
        """Switch to a specific tab by index"""
        try:
            if not self.driver:
                return {
                    "success": False,
                    "error": "Browser not connected. Use browser_connect first."
                }
            
            all_handles = self.driver.window_handles
            
            if tab_index < 0 or tab_index >= len(all_handles):
                return {
                    "success": False,
                    "error": f"Invalid tab index {tab_index}. Valid range: 0-{len(all_handles)-1}"
                }
            
            target_handle = all_handles[tab_index]
            self.driver.switch_to.window(target_handle)
            
            # Wait a moment for the switch to complete
            await asyncio.sleep(0.5)
            
            return {
                "success": True,
                "action": "switch_tab",
                "tab_index": tab_index,
                "url": self.driver.current_url,
                "title": self.driver.title,
                "total_tabs": len(all_handles)
            }
            
        except Exception as e:
            logger.error(f"Error switching tab: {e}")
            return {
                "success": False,
                "error": f"Failed to switch tab: {str(e)}"
            }
    
    async def browser_scroll_page(self, direction: str = "down", amount: int = 500) -> Dict[str, Any]:
        """Scroll the browser page in a specified direction"""
        try:
            if not self.driver:
                return {
                    "success": False,
                    "error": "Browser not connected. Use browser_connect first."
                }
            
            # Execute JavaScript to scroll
            if direction == "down":
                self.driver.execute_script(f"window.scrollBy(0, {amount});")
            elif direction == "up":
                self.driver.execute_script(f"window.scrollBy(0, -{amount});")
            elif direction == "left":
                self.driver.execute_script(f"window.scrollBy(-{amount}, 0);")
            elif direction == "right":
                self.driver.execute_script(f"window.scrollBy({amount}, 0);")
            else:
                return {
                    "success": False,
                    "error": f"Invalid scroll direction: {direction}"
                }
            
            # Wait a bit for any lazy-loaded content
            await asyncio.sleep(0.5)
            
            # Get current scroll position
            scroll_pos = self.driver.execute_script(
                "return {x: window.pageXOffset, y: window.pageYOffset, " +
                "height: document.documentElement.scrollHeight, " +
                "width: document.documentElement.scrollWidth};"
            )
            
            logger.info(f"Scrolled {direction} by {amount}px. Current position: {scroll_pos}")
            
            # Check if at bottom
            viewport_height = self.driver.execute_script("return window.innerHeight;")
            at_bottom = scroll_pos['y'] >= scroll_pos['height'] - viewport_height - 50
            
            return {
                "success": True,
                "direction": direction,
                "amount": amount,
                "current_position": scroll_pos,
                "at_bottom": at_bottom if direction == "down" else False
            }
            
        except Exception as e:
            logger.error(f"Error scrolling browser: {e}")
            return {
                "success": False,
                "error": f"Failed to scroll browser: {str(e)}"
            }
    
    async def browser_click_element(self, selector: str) -> Dict[str, Any]:
        """Click on an element in the browser with comprehensive state tracking"""
        try:
            if not self.driver:
                return {
                    "success": False,
                    "error": "Browser not connected. Use browser_connect first."
                }
            
            # Capture state before click
            before_state = self.driver.execute_script("""
                return {
                    url: window.location.href,
                    title: document.title,
                    focused_element: document.activeElement ? {
                        tag: document.activeElement.tagName,
                        id: document.activeElement.id
                    } : null,
                    scroll_position: {x: window.scrollX, y: window.scrollY},
                    forms_count: document.forms.length,
                    inputs_count: document.querySelectorAll('input, textarea, select').length
                };
            """)
            
            element = None
            selector_type = "unknown"
            element_info = {}
            
            # Try different selector strategies in order of reliability
            try:
                # Method 1: If it's an ID selector
                if selector.startswith('#') and ' ' not in selector:
                    element_id = selector[1:]
                    element = self.driver.find_element(By.ID, element_id)
                    selector_type = "ID"
                    logger.info(f"Found element by ID: {element_id}")
                    
                # Method 2: If it's an XPath selector
                elif selector.startswith('//') or selector.startswith('//*'):
                    element = self.driver.find_element(By.XPATH, selector)
                    selector_type = "XPath"
                    logger.info(f"Found element by XPath: {selector}")
                    
                # Method 3: If it has attribute selectors
                elif '[' in selector and ']' in selector:
                    element = self.driver.find_element(By.CSS_SELECTOR, selector)
                    selector_type = "CSS attribute"
                    logger.info(f"Found element by CSS attribute selector: {selector}")
                    
                # Method 4: Try as CSS selector
                else:
                    element = self.driver.find_element(By.CSS_SELECTOR, selector)
                    selector_type = "CSS"
                    logger.info(f"Found element by CSS selector: {selector}")
                    
            except Exception as e:
                logger.warning(f"Primary selector failed: {e}, trying fallback methods")
                
                # Fallback: Try to find by partial text or aria-label
                if 'aria-label=' in selector:
                    aria_label = selector.split('aria-label="')[1].split('"')[0]
                    element = self.driver.find_element(By.XPATH, f"//*[@aria-label='{aria_label}']")
                    selector_type = "aria-label"
                else:
                    # Last resort: try as generic CSS selector
                    element = self.driver.find_element(By.CSS_SELECTOR, selector)
                    selector_type = "CSS fallback"
            
            if element:
                # Get element information before clicking
                element_info = self.driver.execute_script("""
                    const el = arguments[0];
                    const rect = el.getBoundingClientRect();
                    return {
                        tag: el.tagName,
                        id: el.id || null,
                        className: el.className || null,
                        text: el.innerText ? el.innerText.substring(0, 100) : (el.value || ''),
                        href: el.href || null,
                        type: el.type || null,
                        role: el.getAttribute('role') || null,
                        ariaLabel: el.getAttribute('aria-label') || null,
                        position: {
                            x: Math.round(rect.x + rect.width/2),
                            y: Math.round(rect.y + rect.height/2),
                            width: Math.round(rect.width),
                            height: Math.round(rect.height)
                        },
                        is_visible: rect.width > 0 && rect.height > 0,
                        is_enabled: !el.disabled,
                        parent_tag: el.parentElement ? el.parentElement.tagName : null
                    };
                """, element)
                
                # Ensure element is visible and clickable
                self.driver.execute_script("""
                    arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});
                """, element)
                
                # Add human-like behavior before clicking
                if self.stealth_browser and STEALTH_AVAILABLE:
                    # Human-like delay before clicking (0.3-1.5 seconds)
                    self.stealth_browser.human_like_delay(0.3, 1.5)
                    # Simulate human-like mouse movement to element
                    self.stealth_browser.human_like_mouse_move(element)
                else:
                    # Standard delay
                    time.sleep(random.uniform(0.3, 0.8))
                
                # Try to click using JavaScript if regular click might fail
                try:
                    element.click()
                    click_method = "native"
                except:
                    # Fallback to JavaScript click
                    self.driver.execute_script("arguments[0].click();", element)
                    click_method = "javascript"
                    logger.info("Used JavaScript click as fallback")
                
                # Human-like delay after clicking (0.2-1.0 seconds)
                if self.stealth_browser and STEALTH_AVAILABLE:
                    self.stealth_browser.human_like_delay(0.2, 1.0)
                else:
                    time.sleep(random.uniform(0.2, 0.6))
                
                # Capture state after click
                after_state = self.driver.execute_script("""
                    return {
                        url: window.location.href,
                        title: document.title,
                        focused_element: document.activeElement ? {
                            tag: document.activeElement.tagName,
                            id: document.activeElement.id,
                            type: document.activeElement.type || null
                        } : null,
                        scroll_position: {x: window.scrollX, y: window.scrollY},
                        forms_count: document.forms.length,
                        inputs_count: document.querySelectorAll('input, textarea, select').length,
                        has_alert: false
                    };
                """)
                
                # Check for alerts
                try:
                    alert = self.driver.switch_to.alert
                    after_state['has_alert'] = True
                    after_state['alert_text'] = alert.text
                    # Don't dismiss the alert - let the user handle it
                    self.driver.switch_to.default_content()
                except:
                    pass
                
                # Detect what changed
                changes = self._detect_state_changes(before_state, after_state)
                
                # Get nearby elements for context
                nearby_elements = self.driver.execute_script("""
                    const clicked = arguments[0];
                    const rect = clicked.getBoundingClientRect();
                    const nearby = [];
                    
                    // Find elements near the clicked element
                    const allElements = document.querySelectorAll('*');
                    for (let el of allElements) {
                        if (el === clicked) continue;
                        const elRect = el.getBoundingClientRect();
                        
                        // Check if element is near the clicked element (within 100px)
                        if (Math.abs(elRect.x - rect.x) < 100 && Math.abs(elRect.y - rect.y) < 100) {
                            if (el.innerText && el.innerText.length > 0 && el.innerText.length < 200) {
                                nearby.push({
                                    tag: el.tagName,
                                    text: el.innerText.substring(0, 50),
                                    distance: Math.sqrt(
                                        Math.pow(elRect.x - rect.x, 2) + 
                                        Math.pow(elRect.y - rect.y, 2)
                                    )
                                });
                            }
                        }
                    }
                    
                    // Sort by distance and return closest 5
                    return nearby.sort((a, b) => a.distance - b.distance).slice(0, 5);
                """, element)
                
                return {
                    "success": True,
                    "action": "browser_click",
                    "selector": selector,
                    "selector_type": selector_type,
                    "click_method": click_method,
                    "element": element_info,
                    "state_before": before_state,
                    "state_after": after_state,
                    "changes": changes,
                    "nearby_elements": nearby_elements,
                    "message": f"Successfully clicked {element_info.get('tag', 'element')} at position ({element_info.get('position', {}).get('x')}, {element_info.get('position', {}).get('y')})"
                }
            else:
                return {
                    "success": False,
                    "error": "Element not found",
                    "selector": selector
                }
                
        except Exception as e:
            logger.error(f"Error clicking element: {e}")
            return {
                "success": False,
                "error": str(e),
                "selector": selector,
                "suggestion": "Try using the XPath selector from browser_dom output"
            }
    
    async def browser_type_in_element(self, selector: str, text: str) -> Dict[str, Any]:
        """Type text into an element in the browser"""
        try:
            if not self.driver:
                return {
                    "success": False,
                    "error": "Browser not connected. Use browser_connect first."
                }
            
            # Find element
            element = None
            try:
                if selector.startswith('#'):
                    element = self.driver.find_element(By.ID, selector[1:])
                elif selector.startswith('.'):
                    element = self.driver.find_element(By.CLASS_NAME, selector[1:])
                elif selector.startswith('//'):
                    element = self.driver.find_element(By.XPATH, selector)
                else:
                    element = self.driver.find_element(By.CSS_SELECTOR, selector)
            except:
                element = self.driver.find_element(By.CSS_SELECTOR, selector)
            
            # Clear existing text and type new text
            element.clear()
            element.send_keys(text)
            
            return {
                "success": True,
                "action": "type",
                "selector": selector,
                "text": text,
                "message": f"Typed text into element: {selector}"
            }
            
        except Exception as e:
            logger.error(f"Error typing in element: {e}")
            return {
                "success": False,
                "error": str(e),
                "selector": selector
            }
    
    async def browser_execute_script(self, script: str) -> Dict[str, Any]:
        """Execute JavaScript code in the browser"""
        try:
            if not self.driver:
                return {
                    "success": False,
                    "error": "Browser not connected. Use browser_connect first."
                }
            
            # Execute the JavaScript and capture result
            result = self.driver.execute_script(script)
            
            # Convert result to JSON-serializable format
            import json
            try:
                # Try to serialize the result
                json.dumps(result)
                serializable_result = result
            except (TypeError, ValueError):
                # If not serializable, convert to string
                serializable_result = str(result)
            
            return {
                "success": True,
                "action": "execute_script",
                "script": script[:200] + "..." if len(script) > 200 else script,
                "result": serializable_result,
                "message": "JavaScript executed successfully"
            }
            
        except Exception as e:
            logger.error(f"Error executing JavaScript: {e}")
            return {
                "success": False,
                "error": str(e),
                "script": script[:200] + "..." if len(script) > 200 else script
            }
    
    async def browser_wait_for_page_load(self, selector: Optional[str] = None, timeout: int = 30) -> Dict[str, Any]:
        """
        Wait for page to be fully loaded and optionally for a specific element to appear
        
        Args:
            selector: Optional CSS selector to wait for specific element
            timeout: Maximum time to wait in seconds (default 30)
        """
        try:
            if not self.driver:
                return {
                    "success": False,
                    "error": "Browser not connected. Use browser_connect first."
                }
            
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC
            from selenium.webdriver.common.by import By
            
            # First wait for document ready state
            WebDriverWait(self.driver, timeout).until(
                lambda driver: driver.execute_script("return document.readyState") == "complete"
            )
            
            # Wait for jQuery to finish if it exists
            self.driver.execute_script("""
                if (typeof jQuery !== 'undefined') {
                    return jQuery.active == 0;
                }
                return true;
            """)
            
            # Wait for any pending fetch/XHR requests to complete
            self.driver.execute_script("""
                return new Promise((resolve) => {
                    let pendingRequests = 0;
                    
                    // Track fetch requests
                    const originalFetch = window.fetch;
                    window.fetch = function(...args) {
                        pendingRequests++;
                        return originalFetch.apply(this, args).finally(() => {
                            pendingRequests--;
                        });
                    };
                    
                    // Track XHR requests
                    const originalOpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(...args) {
                        this.addEventListener('loadend', () => {
                            pendingRequests--;
                        });
                        pendingRequests++;
                        return originalOpen.apply(this, args);
                    };
                    
                    // Check if requests are done
                    const checkRequests = setInterval(() => {
                        if (pendingRequests === 0) {
                            clearInterval(checkRequests);
                            resolve(true);
                        }
                    }, 100);
                    
                    // Timeout after 5 seconds for network requests
                    setTimeout(() => {
                        clearInterval(checkRequests);
                        resolve(true);
                    }, 5000);
                });
            """)
            
            # If a specific selector is provided, wait for it
            if selector:
                try:
                    # Determine selector type
                    if selector.startswith('#'):
                        element = WebDriverWait(self.driver, timeout).until(
                            EC.presence_of_element_located((By.ID, selector[1:]))
                        )
                    elif selector.startswith('.'):
                        element = WebDriverWait(self.driver, timeout).until(
                            EC.presence_of_element_located((By.CLASS_NAME, selector[1:]))
                        )
                    elif selector.startswith('//'):
                        element = WebDriverWait(self.driver, timeout).until(
                            EC.presence_of_element_located((By.XPATH, selector))
                        )
                    else:
                        element = WebDriverWait(self.driver, timeout).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                        )
                    
                    # Check if element is visible
                    is_visible = element.is_displayed()
                    
                    return {
                        "success": True,
                        "action": "wait",
                        "page_loaded": True,
                        "element_found": True,
                        "element_visible": is_visible,
                        "selector": selector,
                        "message": f"Page loaded and element '{selector}' found"
                    }
                except:
                    return {
                        "success": False,
                        "action": "wait",
                        "page_loaded": True,
                        "element_found": False,
                        "selector": selector,
                        "error": f"Page loaded but element '{selector}' not found within {timeout} seconds"
                    }
            else:
                # Just wait for page load
                return {
                    "success": True,
                    "action": "wait",
                    "page_loaded": True,
                    "message": "Page fully loaded (document ready, network idle)"
                }
                
        except Exception as e:
            logger.error(f"Error waiting for page/element: {e}")
            return {
                "success": False,
                "error": str(e),
                "action": "wait"
            }
    
    async def browser_navigate_to(self, url: str) -> Dict[str, Any]:
        """Navigate to a URL in the browser"""
        try:
            if not self.driver:
                return {
                    "success": False,
                    "error": "Browser not connected. Use browser_connect first."
                }
            
            # Ensure URL has protocol
            if not url.startswith(('http://', 'https://')):
                url = 'https://' + url
            
            self.driver.get(url)
            
            # Wait for page to load with longer timeout
            WebDriverWait(self.driver, 30).until(
                lambda driver: driver.execute_script("return document.readyState") == "complete"
            )
            
            return {
                "success": True,
                "action": "navigate",
                "url": url,
                "title": self.driver.title,
                "message": f"Navigated to: {url}"
            }
            
        except Exception as e:
            logger.error(f"Error navigating to URL: {e}")
            return {
                "success": False,
                "error": str(e),
                "url": url
            }
    
    async def get_browser_info(self) -> Dict[str, Any]:
        """Get current browser information"""
        try:
            if not self.driver:
                return {
                    "success": False,
                    "error": "Browser not connected. Use browser_connect first."
                }
            
            # Get browser info
            info = {
                "success": True,
                "current_url": self.driver.current_url,
                "title": self.driver.title,
                "window_handles": len(self.driver.window_handles),
                "window_size": self.driver.get_window_size(),
                "cookies": len(self.driver.get_cookies()),
                "ready_state": self.driver.execute_script("return document.readyState")
            }
            
            # Try to get page metrics
            try:
                metrics = self.driver.execute_script("""
                    return {
                        scroll_height: document.documentElement.scrollHeight,
                        scroll_width: document.documentElement.scrollWidth,
                        viewport_height: window.innerHeight,
                        viewport_width: window.innerWidth,
                        scroll_y: window.scrollY,
                        scroll_x: window.scrollX
                    };
                """)
                info["page_metrics"] = metrics
            except:
                pass
            
            return info
            
        except Exception as e:
            logger.error(f"Error getting browser info: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def get_browser_state(self) -> Dict[str, Any]:
        """Get comprehensive browser state including focus, cursor position, and interaction state"""
        try:
            if not self.driver:
                return {
                    "success": False,
                    "error": "Browser not connected. Use browser_connect first."
                }
            
            # Get comprehensive state information
            state_script = """
            return {
                // Basic page info
                url: window.location.href,
                title: document.title,
                domain: window.location.hostname,
                protocol: window.location.protocol,
                path: window.location.pathname,
                hash: window.location.hash,
                
                // Page state
                ready_state: document.readyState,
                visibility: document.visibilityState,
                has_focus: document.hasFocus(),
                
                // Active element (where cursor/focus is)
                active_element: {
                    tag: document.activeElement.tagName,
                    id: document.activeElement.id || null,
                    className: document.activeElement.className || null,
                    type: document.activeElement.type || null,
                    name: document.activeElement.name || null,
                    value: document.activeElement.value || null,
                    placeholder: document.activeElement.placeholder || null,
                    text: document.activeElement.innerText ? document.activeElement.innerText.substring(0, 100) : null,
                    href: document.activeElement.href || null,
                    is_editable: document.activeElement.contentEditable === 'true' || 
                                 ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName),
                    rect: document.activeElement.getBoundingClientRect ? {
                        x: Math.round(document.activeElement.getBoundingClientRect().x),
                        y: Math.round(document.activeElement.getBoundingClientRect().y),
                        width: Math.round(document.activeElement.getBoundingClientRect().width),
                        height: Math.round(document.activeElement.getBoundingClientRect().height)
                    } : null
                },
                
                // Mouse position (if available)
                mouse: window.lastMousePosition || {x: null, y: null},
                
                // Scroll position
                scroll: {
                    x: window.scrollX,
                    y: window.scrollY,
                    height: document.documentElement.scrollHeight,
                    width: document.documentElement.scrollWidth,
                    viewport_height: window.innerHeight,
                    viewport_width: window.innerWidth,
                    at_top: window.scrollY === 0,
                    at_bottom: window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 5
                },
                
                // Forms on page
                forms: Array.from(document.forms).map(form => ({
                    id: form.id,
                    name: form.name,
                    action: form.action,
                    method: form.method,
                    fields: form.elements.length
                })),
                
                // Interactive elements count
                interactive: {
                    buttons: document.querySelectorAll('button, input[type="button"], input[type="submit"]').length,
                    links: document.querySelectorAll('a[href]').length,
                    inputs: document.querySelectorAll('input, textarea, select').length,
                    images: document.querySelectorAll('img').length,
                    videos: document.querySelectorAll('video').length
                },
                
                // Any modals or popups
                has_alert: false,
                dialog_open: document.querySelector('dialog[open]') !== null,
                
                // Page loading indicators
                loading_indicators: {
                    spinners: document.querySelectorAll('[class*="spinner"], [class*="loading"], [class*="loader"]').length,
                    progress_bars: document.querySelectorAll('[role="progressbar"], progress').length
                },
                
                // Navigation state
                can_go_back: window.history.length > 1,
                
                // Timestamp
                timestamp: Date.now()
            };
            """  
            
            # Inject mouse tracking if not already done
            try:
                self.driver.execute_script("""
                    if (!window.mouseTrackingEnabled) {
                        window.lastMousePosition = {x: 0, y: 0};
                        document.addEventListener('mousemove', function(e) {
                            window.lastMousePosition = {x: e.clientX, y: e.clientY};
                        });
                        window.mouseTrackingEnabled = true;
                    }
                """)
            except:
                pass
            
            # Get the state
            state = self.driver.execute_script(state_script)
            
            # Check for alerts
            try:
                alert = self.driver.switch_to.alert
                state['has_alert'] = True
                state['alert_text'] = alert.text
                # Switch back to default content
                self.driver.switch_to.default_content()
            except:
                state['has_alert'] = False
            
            # Get window information
            state['window'] = {
                'handles': len(self.driver.window_handles),
                'current_handle': self.driver.current_window_handle,
                'size': self.driver.get_window_size(),
                'position': self.driver.get_window_position()
            }
            
            return {
                "success": True,
                "action": "browser_state",
                "state": state,
                "message": "Browser state retrieved successfully"
            }
            
        except Exception as e:
            logger.error(f"Error getting browser state: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def get_browser_context(self) -> Dict[str, Any]:
        """Get AI-friendly context about the current page and interaction state"""
        try:
            if not self.driver:
                return {
                    "success": False,
                    "error": "Browser not connected. Use browser_connect first."
                }
            
            # Get page context for AI understanding
            context_script = """
            // Get visible text near the viewport
            function getVisibleText() {
                const elements = document.elementsFromPoint(window.innerWidth/2, window.innerHeight/2);
                let text = [];
                
                // Get text from center of viewport
                for (let el of elements) {
                    if (el.innerText && el.innerText.length > 0 && el.innerText.length < 1000) {
                        text.push(el.innerText);
                        break;
                    }
                }
                
                // Get any headings visible
                const headings = document.querySelectorAll('h1, h2, h3');
                for (let h of headings) {
                    const rect = h.getBoundingClientRect();
                    if (rect.top >= 0 && rect.top <= window.innerHeight) {
                        text.push('Heading: ' + h.innerText);
                    }
                }
                
                return text.slice(0, 5).join(' | ');
            }
            
            // Get actionable elements in viewport
            function getActionableElements() {
                const elements = [];
                const actionable = document.querySelectorAll(
                    'button, a[href], input, select, textarea, [role="button"], [onclick]'
                );
                
                for (let el of actionable) {
                    const rect = el.getBoundingClientRect();
                    if (rect.top >= -100 && rect.top <= window.innerHeight + 100 && 
                        rect.left >= -100 && rect.left <= window.innerWidth + 100) {
                        
                        let label = el.innerText || el.value || el.placeholder || 
                                   el.getAttribute('aria-label') || el.getAttribute('title') || 
                                   el.getAttribute('name') || el.id || '';
                        
                        if (label.length > 50) label = label.substring(0, 50) + '...';
                        
                        elements.push({
                            type: el.tagName.toLowerCase(),
                            label: label,
                            visible: rect.width > 0 && rect.height > 0,
                            position: {
                                x: Math.round(rect.x + rect.width/2),
                                y: Math.round(rect.y + rect.height/2)
                            },
                            selector: el.id ? '#' + el.id : null
                        });
                    }
                }
                
                return elements.slice(0, 20);  // Top 20 actionable elements
            }
            
            // Detect page type and context
            function detectPageContext() {
                const url = window.location.href;
                const title = document.title.toLowerCase();
                const bodyText = document.body.innerText.toLowerCase().substring(0, 500);
                
                let context = {
                    type: 'general',
                    indicators: []
                };
                
                // Login/Auth detection
                if (url.includes('login') || url.includes('signin') || url.includes('auth') ||
                    title.includes('login') || title.includes('sign in') ||
                    document.querySelector('input[type="password"]')) {
                    context.type = 'authentication';
                    context.indicators.push('login form detected');
                }
                
                // Search detection
                if (url.includes('search') || url.includes('query') || 
                    document.querySelector('input[type="search"]') ||
                    title.includes('search')) {
                    context.type = 'search';
                    context.indicators.push('search interface detected');
                }
                
                // Shopping/E-commerce
                if (url.includes('cart') || url.includes('checkout') || url.includes('shop') ||
                    bodyText.includes('add to cart') || bodyText.includes('buy now')) {
                    context.type = 'ecommerce';
                    context.indicators.push('shopping interface detected');
                }
                
                // Form detection
                if (document.forms.length > 0) {
                    context.has_forms = true;
                    context.form_fields = Array.from(document.querySelectorAll('input, textarea, select')).length;
                }
                
                // Error detection
                if (title.includes('404') || title.includes('error') ||
                    bodyText.includes('not found') || bodyText.includes('error')) {
                    context.has_error = true;
                    context.indicators.push('possible error page');
                }
                
                return context;
            }
            
            return {
                url: window.location.href,
                title: document.title,
                visible_text: getVisibleText(),
                actionable_elements: getActionableElements(),
                page_context: detectPageContext(),
                focused_element: document.activeElement ? {
                    tag: document.activeElement.tagName,
                    id: document.activeElement.id,
                    value: document.activeElement.value
                } : null,
                user_can_interact: document.readyState === 'complete' && !document.hidden
            };
            """  
            
            # Get the context
            context = self.driver.execute_script(context_script)
            
            # Create AI-friendly summary
            summary = self._generate_context_summary(context)
            
            return {
                "success": True,
                "action": "browser_context",
                "context": context,
                "summary": summary,
                "message": "Browser context retrieved for AI awareness"
            }
            
        except Exception as e:
            logger.error(f"Error getting browser context: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _detect_state_changes(self, before: Dict, after: Dict) -> Dict[str, Any]:
        """Detect what changed between two browser states"""
        changes = {
            "detected": [],
            "summary": ""
        }
        
        # Check URL change
        if before.get('url') != after.get('url'):
            changes["detected"].append("navigation")
            changes["url_changed"] = {
                "from": before.get('url'),
                "to": after.get('url')
            }
        
        # Check title change
        if before.get('title') != after.get('title'):
            changes["detected"].append("title_changed")
            changes["title"] = {
                "from": before.get('title'),
                "to": after.get('title')
            }
        
        # Check focus change
        before_focus = before.get('focused_element', {})
        after_focus = after.get('focused_element', {})
        if before_focus.get('tag') != after_focus.get('tag') or before_focus.get('id') != after_focus.get('id'):
            changes["detected"].append("focus_changed")
            changes["focus"] = {
                "from": before_focus,
                "to": after_focus
            }
        
        # Check scroll change
        before_scroll = before.get('scroll_position', {})
        after_scroll = after.get('scroll_position', {})
        if abs(before_scroll.get('y', 0) - after_scroll.get('y', 0)) > 10:
            changes["detected"].append("scrolled")
            changes["scroll"] = {
                "from_y": before_scroll.get('y', 0),
                "to_y": after_scroll.get('y', 0),
                "direction": "down" if after_scroll.get('y', 0) > before_scroll.get('y', 0) else "up"
            }
        
        # Check form/input changes
        if before.get('forms_count', 0) != after.get('forms_count', 0):
            changes["detected"].append("forms_changed")
            changes["forms"] = {
                "before": before.get('forms_count', 0),
                "after": after.get('forms_count', 0)
            }
        
        if before.get('inputs_count', 0) != after.get('inputs_count', 0):
            changes["detected"].append("inputs_changed")
            changes["inputs"] = {
                "before": before.get('inputs_count', 0),
                "after": after.get('inputs_count', 0)
            }
        
        # Check for alerts
        if after.get('has_alert') and not before.get('has_alert'):
            changes["detected"].append("alert_appeared")
            changes["alert"] = after.get('alert_text', '')
        
        # Generate summary
        if changes["detected"]:
            summary_parts = []
            if "navigation" in changes["detected"]:
                summary_parts.append("navigated to new page")
            if "focus_changed" in changes["detected"]:
                new_focus = after_focus.get('tag', 'element')
                if after_focus.get('type'):
                    new_focus += f" ({after_focus['type']})"
                summary_parts.append(f"focus moved to {new_focus}")
            if "scrolled" in changes["detected"]:
                summary_parts.append(f"page scrolled {changes.get('scroll', {}).get('direction', '')}")
            if "alert_appeared" in changes["detected"]:
                summary_parts.append("alert dialog appeared")
            if "forms_changed" in changes["detected"] or "inputs_changed" in changes["detected"]:
                summary_parts.append("page content changed")
            
            changes["summary"] = "Click caused: " + ", ".join(summary_parts)
        else:
            changes["summary"] = "Click processed (no visible changes detected)"
        
        return changes
    
    def _generate_context_summary(self, context: Dict) -> str:
        """Generate a human-readable summary of the browser context for AI understanding"""
        summary_parts = []
        
        # Current page
        summary_parts.append(f"On page: {context.get('title', 'Unknown')}")
        
        # Page type
        page_context = context.get('page_context', {})
        if page_context.get('type'):
            summary_parts.append(f"Page type: {page_context['type']}")
        
        # Interaction possibilities
        actionable = context.get('actionable_elements', [])
        if actionable:
            types = {}
            for el in actionable:
                el_type = el.get('type', 'unknown')
                types[el_type] = types.get(el_type, 0) + 1
            
            interaction_summary = []
            for el_type, count in types.items():
                interaction_summary.append(f"{count} {el_type}s")
            summary_parts.append(f"Can interact with: {', '.join(interaction_summary)}")
        
        # Focus state
        focused = context.get('focused_element')
        if focused and focused.get('tag'):
            focus_desc = f"Focus on: {focused['tag']}"
            if focused.get('id'):
                focus_desc += f" (#{focused['id']})"
            if focused.get('value'):
                focus_desc += f" with value '{focused['value'][:30]}'"
            summary_parts.append(focus_desc)
        
        # Key indicators
        if page_context.get('indicators'):
            summary_parts.append(f"Indicators: {', '.join(page_context['indicators'])}")
        
        return " | ".join(summary_parts)
    
    async def start(self):
        """Start WebSocket server with PERSISTENT connections - NO AUTO-DISCONNECT"""
        logger.info(f"Starting PERSISTENT WebSocket server on {self.host}:{self.port}")
        
        # HTTP request filter to prevent 426 errors
        async def process_request(path, request_headers):
            """Filter non-WebSocket requests"""
            upgrade = request_headers.get("Upgrade", "").lower()
            if upgrade != "websocket":
                logger.warning(f"Rejected non-WebSocket request: {request_headers.get('User-Agent', 'unknown')}")
                return (426, {"Upgrade": "websocket"}, b"WebSocket upgrade required\n")
            return None
        
        # Configure for PERSISTENT connections
        server_config = {
            "max_size": 100 * 1024 * 1024,  # 100MB for large screenshots
            "max_queue": 1000,  # Max queued connections
            "read_limit": 2 ** 20,  # 1MB read buffer
            "write_limit": 2 ** 20,  # 1MB write buffer
            "ping_interval": None,  # DISABLED - prevents disconnections
            "ping_timeout": None,  # DISABLED - prevents timeout errors
            "close_timeout": 60,  # 60s for graceful close
            "compression": None,  # No compression for lower latency
            "process_request": process_request  # Filter HTTP requests
        }
        
        async with websockets.serve(
            self.handle_client, 
            self.host, 
            self.port,
            **server_config
        ):
            logger.info(f"✅ AI Agent Server listening on ws://{self.host}:{self.port}")
            logger.info("✅ PERSISTENT connections enabled - NO auto-disconnect")
            logger.info("✅ HTTP filtering enabled - prevents 426 errors")
            logger.info(f"Configuration: {server_config}")
            await asyncio.Future()  # Run forever

def main():
    """Main entry point"""
    print("=" * 50)
    print("AI Desktop Agent Server Starting")
    print("=" * 50)
    print(f"Python version: {sys.version}")
    print(f"Display: {os.environ.get('DISPLAY', 'not set')}")
    print(f"PyAutoGUI version: {pyautogui.__version__}")
    
    # Test pyautogui
    if PYAUTOGUI_AVAILABLE:
        try:
            screen_size = pyautogui.size()
            print(f"Screen size detected: {screen_size}")
        except Exception as e:
            print(f"Warning: Could not detect screen size: {e}")
            print("This is normal in headless environments")
    else:
        print("PyAutoGUI not available - using mock implementation")
    
    print("Continuing with server startup...")
    
    server = DesktopAgentServer(
        host=os.getenv('AGENT_HOST', '0.0.0.0'),
        port=int(os.getenv('AGENT_PORT', '8080'))
    )
    
    print(f"Starting server on {server.host}:{server.port}")
    print("=" * 50)
    
    try:
        asyncio.run(server.start())
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()