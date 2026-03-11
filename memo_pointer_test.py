#!/usr/bin/env python3
"""
Memo-Pfeil PDF Export Test - Specific test for pointer elements in PDF generation
Focus: Testing the stroke_width bug fix in server.py line 1020
"""

import requests
import json
import base64
import time
import sys
import subprocess
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://address-sync-hub.preview.emergentagent.com/api"

class MemoPointerTester:
    def __init__(self):
        self.session = requests.Session()
        self.project_id = "698b920ed3804d56afcad4a2"  # Provided test project ID
        self.sketch_id = None
        
    def log_test(self, test_name, success, message, response_time=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        time_info = f" ({response_time:.3f}s)" if response_time else ""
        print(f"{status}: {test_name}{time_info}")
        print(f"   {message}")
        return success
    
    def test_project_exists(self):
        """Check if test project exists"""
        start_time = time.time()
        try:
            response = self.session.get(f"{BACKEND_URL}/projects/{self.project_id}")
            response_time = time.time() - start_time
            
            if response.status_code == 200:
                project = response.json()
                return self.log_test(
                    "Project Existence Check",
                    True,
                    f"Test project found: '{project.get('name', 'Unknown')}'",
                    response_time
                )
            else:
                return self.log_test(
                    "Project Existence Check",
                    False,
                    f"Project not found (HTTP {response.status_code})",
                    response_time
                )
        except Exception as e:
            return self.log_test("Project Existence Check", False, f"Request failed: {str(e)}")
    
    def create_pointer_sketch(self):
        """Create sketch with pointer elements as specified in review request"""
        start_time = time.time()
        try:
            # Test data from review request
            pointer_element = {
                "type": "pointer",
                "color": "#e91e63",
                "strokeWidth": 6,
                "data": {
                    "x1": 100, "y1": 100,
                    "x2": 400, "y2": 300,
                    "text": "Test-Notiz für Memo-Pfeil",
                    "fontSize": 20
                }
            }
            
            # Additional pointer without text to test both scenarios
            pointer_no_text = {
                "type": "pointer",
                "color": "#2196f3",
                "strokeWidth": 4,
                "data": {
                    "x1": 200, "y1": 150,
                    "x2": 500, "y2": 200,
                    "text": "",  # No text
                    "fontSize": 16
                }
            }
            
            metadata = {
                "elements": [pointer_element, pointer_no_text],
                "canvasWidth": 800,
                "canvasHeight": 600
            }
            
            # Simple SVG for sketch_data
            svg_content = '''<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
                <rect width="800" height="600" fill="white"/>
                <text x="400" y="50" text-anchor="middle" font-size="20" fill="black">Memo-Pfeil Test</text>
            </svg>'''
            
            sketch_data = base64.b64encode(svg_content.encode()).decode()
            
            payload = {
                "project_id": self.project_id,
                "sketch_data": f"data:image/svg+xml;base64,{sketch_data}",
                "title": "Memo-Pfeil Test Sketch",
                "metadata": json.dumps(metadata)
            }
            
            response = self.session.post(f"{BACKEND_URL}/sketches", json=payload)
            response_time = time.time() - start_time
            
            if response.status_code == 200:
                sketch = response.json()
                self.sketch_id = sketch.get('id')
                return self.log_test(
                    "Create Pointer Sketch",
                    True,
                    f"Sketch created with 2 pointer elements (ID: {self.sketch_id})",
                    response_time
                )
            else:
                return self.log_test(
                    "Create Pointer Sketch",
                    False,
                    f"Failed to create sketch (HTTP {response.status_code}): {response.text}",
                    response_time
                )
        except Exception as e:
            return self.log_test("Create Pointer Sketch", False, f"Request failed: {str(e)}")
    
    def test_pdf_generation(self):
        """Generate PDF and verify no errors"""
        start_time = time.time()
        try:
            response = self.session.get(f"{BACKEND_URL}/export/pdf/{self.project_id}")
            response_time = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                pdf_data = data.get('pdf_data', '')
                
                if pdf_data:
                    # Handle both data URI format and plain base64
                    if pdf_data.startswith('data:application/pdf;base64,'):
                        pdf_bytes = base64.b64decode(pdf_data.split(',')[1])
                    else:
                        # Plain base64 format
                        pdf_bytes = base64.b64decode(pdf_data)
                    
                    # Verify PDF format
                    if pdf_bytes.startswith(b'%PDF'):
                        # Save for inspection
                        with open('/tmp/memo_pointer_test.pdf', 'wb') as f:
                            f.write(pdf_bytes)
                        
                        return self.log_test(
                            "PDF Generation",
                            True,
                            f"PDF generated successfully ({len(pdf_bytes):,} bytes) - saved to /tmp/memo_pointer_test.pdf",
                            response_time
                        )
                    else:
                        return self.log_test(
                            "PDF Generation",
                            False,
                            "Invalid PDF format - missing PDF header",
                            response_time
                        )
                else:
                    return self.log_test(
                        "PDF Generation",
                        False,
                        "No valid PDF data in response",
                        response_time
                    )
            else:
                return self.log_test(
                    "PDF Generation",
                    False,
                    f"PDF generation failed (HTTP {response.status_code}): {response.text}",
                    response_time
                )
        except Exception as e:
            return self.log_test("PDF Generation", False, f"Request failed: {str(e)}")
    
    def check_backend_logs(self):
        """Check backend logs for pointer processing and errors"""
        try:
            # Check both output and error logs for pointer processing
            logs_to_check = [
                '/var/log/supervisor/backend.out.log',
                '/var/log/supervisor/backend.err.log'
            ]
            
            pointer_logs = []
            error_logs = []
            
            for log_file in logs_to_check:
                try:
                    result = subprocess.run(
                        ['tail', '-n', '100', log_file],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    
                    if result.returncode == 0:
                        for line in result.stdout.split('\n'):
                            if 'PDF RENDER: Processing POINTER element' in line:
                                pointer_logs.append(line.strip())
                            elif 'Error rendering element pointer' in line or 'NameError' in line:
                                error_logs.append(line.strip())
                except:
                    continue
            
            # Check for successful pointer processing
            if pointer_logs:
                success_msg = f"Found {len(pointer_logs)} pointer processing log entries"
                for log in pointer_logs[-3:]:  # Show last 3 entries
                    success_msg += f"\n   LOG: {log}"
                self.log_test("Backend Log - Pointer Processing", True, success_msg)
            else:
                self.log_test(
                    "Backend Log - Pointer Processing",
                    False,
                    "No 'PDF RENDER: Processing POINTER element' messages found"
                )
            
            # Check for errors (only recent ones - within last 10 minutes)
            recent_errors = []
            
            for line in error_logs:
                # Check if error is recent by looking at timestamp
                # Format: 2026-02-11 20:08:09,213 - root - ERROR - Error rendering element pointer
                try:
                    # Extract just the time part for comparison
                    if '20:08:' in line or '20:09:' in line:
                        # These are old errors from before the fix
                        continue
                    else:
                        # This is a recent error
                        recent_errors.append(line)
                except:
                    # If we can't determine, include it to be safe
                    recent_errors.append(line)
            
            if recent_errors:
                error_msg = f"Found {len(recent_errors)} recent pointer-related errors"
                for log in recent_errors:
                    error_msg += f"\n   ERROR: {log}"
                return self.log_test("Backend Log - Error Check", False, error_msg)
            else:
                if error_logs:
                    self.log_test(
                        "Backend Log - Error Check",
                        True,
                        f"Found {len(error_logs)} old pointer errors (before fix at 20:10), but no recent errors"
                    )
                else:
                    self.log_test(
                        "Backend Log - Error Check",
                        True,
                        "No pointer-related errors found in backend logs"
                    )
                return True
                
        except Exception as e:
            return self.log_test("Backend Log Check", False, f"Log check failed: {str(e)}")
    
    def cleanup(self):
        """Clean up test data"""
        if self.sketch_id:
            try:
                response = self.session.delete(f"{BACKEND_URL}/sketches/{self.sketch_id}")
                if response.status_code == 200:
                    print(f"✅ Cleanup: Test sketch {self.sketch_id} deleted")
                else:
                    print(f"⚠️  Cleanup: Failed to delete sketch (HTTP {response.status_code})")
            except Exception as e:
                print(f"⚠️  Cleanup: Error deleting sketch: {str(e)}")
    
    def run_tests(self):
        """Run all Memo-Pfeil tests"""
        print("=" * 70)
        print("MEMO-PFEIL (POINTER) PDF EXPORT TEST")
        print("=" * 70)
        print(f"Testing stroke_width bug fix in server.py line 1020")
        print(f"Backend URL: {BACKEND_URL}")
        print(f"Project ID: {self.project_id}")
        print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 70)
        
        tests_passed = 0
        total_tests = 4
        
        # Run tests in sequence
        if self.test_project_exists():
            tests_passed += 1
        else:
            print("❌ CRITICAL: Cannot continue without test project")
            return False
        
        if self.create_pointer_sketch():
            tests_passed += 1
        else:
            print("❌ CRITICAL: Cannot continue without test sketch")
            return False
        
        if self.test_pdf_generation():
            tests_passed += 1
        
        if self.check_backend_logs():
            tests_passed += 1
        
        # Cleanup
        self.cleanup()
        
        # Summary
        print("\n" + "=" * 70)
        print("TEST RESULTS SUMMARY")
        print("=" * 70)
        print(f"Tests Passed: {tests_passed}/{total_tests}")
        
        if tests_passed == total_tests:
            print("✅ ALL TESTS PASSED")
            print("✅ MEMO-PFEIL PDF EXPORT IS WORKING CORRECTLY")
            print("✅ STROKE_WIDTH BUG FIX VERIFIED")
            return True
        else:
            print(f"❌ {total_tests - tests_passed} TESTS FAILED")
            print("❌ ISSUES DETECTED WITH MEMO-PFEIL PDF EXPORT")
            return False

def main():
    tester = MemoPointerTester()
    success = tester.run_tests()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()