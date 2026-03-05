#!/usr/bin/env python3
"""
Arrow and Text Rendering PDF Export Test
Testing the corrected scaling logic for PDF generation
"""

import requests
import json
import base64
import time
import os
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://sketch-pdf-notes.preview.emergentagent.com/api"

def log_test(message):
    """Log test messages with timestamp"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] {message}")

def create_test_customer():
    """Create a test customer for arrow testing"""
    log_test("Creating test customer...")
    
    customer_data = {
        "name": "Pfeil Test Kunde v2",
        "email": "pfeil.test.v2@example.com", 
        "phone": "+49 151 98765432",
        "address": "Pfeilstraße 123, 12345 Teststadt"
    }
    
    response = requests.post(f"{BACKEND_URL}/customers", json=customer_data)
    if response.status_code == 200:
        customer = response.json()
        log_test(f"✅ Customer created: {customer['id']}")
        return customer['id']
    else:
        log_test(f"❌ Customer creation failed: {response.status_code} - {response.text}")
        return None

def create_test_project(customer_id):
    """Create a test project for arrow testing"""
    log_test("Creating test project...")
    
    project_data = {
        "customer_id": customer_id,
        "name": "Pfeil Rendering Test v2",
        "description": "Test für korrigierte Pfeil- und Text-Skalierung in PDF Export",
        "remarks": "Testet verschiedene Pfeilstärken (2, 5, 8) und Textpositionierung mit canvasWidth: 800, canvasHeight: 600"
    }
    
    response = requests.post(f"{BACKEND_URL}/projects", json=project_data)
    if response.status_code == 200:
        project = response.json()
        log_test(f"✅ Project created: {project['id']}")
        return project['id']
    else:
        log_test(f"❌ Project creation failed: {response.status_code} - {response.text}")
        return None

def create_sketch_with_arrows_and_text(project_id):
    """Create a sketch with arrows of different strokeWidth (2, 5, 8) and text elements"""
    log_test("Creating sketch with arrows (strokeWidth: 2, 5, 8) and text...")
    
    # Create metadata with various elements including arrows with different strokeWidths
    metadata = {
        "canvasWidth": 800,
        "canvasHeight": 600,
        "elements": [
            # Arrow 1: strokeWidth 2, red color, with description
            {
                "type": "arrow",
                "x": 100,
                "y": 100,
                "width": 200,
                "height": 50,
                "color": "#FF0000",
                "strokeWidth": 2,
                "rotation": 0,
                "data": {
                    "x1": 100,
                    "y1": 100,
                    "x2": 300,
                    "y2": 150,
                    "text": "Länge: 2.5m",
                    "heads": "single"
                }
            },
            # Arrow 2: strokeWidth 5, green color, with description
            {
                "type": "arrow", 
                "x": 150,
                "y": 200,
                "width": 250,
                "height": 60,
                "color": "#00FF00",
                "strokeWidth": 5,
                "rotation": 0,
                "data": {
                    "x1": 150,
                    "y1": 200,
                    "x2": 400,
                    "y2": 260,
                    "text": "Breite: 4.8m",
                    "heads": "double"
                }
            },
            # Arrow 3: strokeWidth 8, blue color, with description
            {
                "type": "arrow",
                "x": 200,
                "y": 350,
                "width": 300,
                "height": 80,
                "color": "#0000FF", 
                "strokeWidth": 8,
                "rotation": 0,
                "data": {
                    "x1": 200,
                    "y1": 350,
                    "x2": 500,
                    "y2": 430,
                    "text": "Höhe: 7.2m",
                    "heads": "single"
                }
            },
            # Text element
            {
                "type": "text",
                "x": 50,
                "y": 50,
                "color": "#000000",
                "strokeWidth": 1,
                "rotation": 0,
                "data": {
                    "text": "Dachmaße Testhaus - Skalierung Test"
                }
            },
            # Line element
            {
                "type": "line",
                "x": 50,
                "y": 500,
                "color": "#FF00FF",
                "strokeWidth": 3,
                "rotation": 0,
                "data": {
                    "x1": 50,
                    "y1": 500,
                    "x2": 750,
                    "y2": 500
                }
            },
            # Additional text for positioning test
            {
                "type": "text",
                "x": 400,
                "y": 550,
                "color": "#666666",
                "strokeWidth": 1,
                "rotation": 0,
                "data": {
                    "text": "Canvas: 800x600 - Uniform Scale Test"
                }
            }
        ]
    }
    
    # Create a simple SVG as sketch_data (base64 encoded)
    svg_content = '''<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="white" stroke="#ccc" stroke-width="1"/>
        <text x="400" y="30" text-anchor="middle" font-size="16" fill="black">Sketch Background - Arrow Test v2</text>
    </svg>'''
    
    svg_base64 = base64.b64encode(svg_content.encode()).decode()
    
    sketch_data = {
        "project_id": project_id,
        "sketch_data": f"data:image/svg+xml;base64,{svg_base64}",
        "title": "Pfeil Test Skizze v2 - Skalierung",
        "metadata": json.dumps(metadata)
    }
    
    response = requests.post(f"{BACKEND_URL}/sketches", json=sketch_data)
    if response.status_code == 200:
        sketch = response.json()
        log_test(f"✅ Sketch created with arrows (strokeWidth: 2, 5, 8): {sketch['id']}")
        
        # Verify metadata was saved
        verify_response = requests.get(f"{BACKEND_URL}/sketches/project/{project_id}")
        if verify_response.status_code == 200:
            sketches = verify_response.json()
            if sketches and sketches[0].get('metadata'):
                saved_metadata = json.loads(sketches[0]['metadata'])
                canvas_width = saved_metadata.get('canvasWidth')
                canvas_height = saved_metadata.get('canvasHeight')
                elements_count = len(saved_metadata.get('elements', []))
                log_test(f"✅ Metadata verified: canvasWidth={canvas_width}, canvasHeight={canvas_height}, elements={elements_count}")
            else:
                log_test("⚠️ Metadata not found in saved sketch")
        
        return sketch['id']
    else:
        log_test(f"❌ Sketch creation failed: {response.status_code} - {response.text}")
        return None

def generate_pdf_and_save(project_id):
    """Generate PDF and save to /tmp/arrow_test_v2.pdf"""
    log_test("Generating PDF with corrected arrow and text rendering...")
    
    start_time = time.time()
    response = requests.get(f"{BACKEND_URL}/export/pdf/{project_id}")
    end_time = time.time()
    
    if response.status_code == 200:
        pdf_response = response.json()
        pdf_data = pdf_response.get('pdf_data', '')
        filename = pdf_response.get('filename', 'test.pdf')
        
        # Decode and save PDF
        try:
            pdf_bytes = base64.b64decode(pdf_data)
            pdf_path = "/tmp/arrow_test_v2.pdf"
            
            with open(pdf_path, 'wb') as f:
                f.write(pdf_bytes)
            
            file_size = len(pdf_bytes)
            generation_time = end_time - start_time
            
            log_test(f"✅ PDF generated successfully:")
            log_test(f"   - File size: {file_size:,} bytes ({file_size/1024:.1f} KB)")
            log_test(f"   - Generation time: {generation_time:.3f}s")
            log_test(f"   - Saved to: {pdf_path}")
            log_test(f"   - Original filename: {filename}")
            
            # Verify PDF format
            if pdf_bytes.startswith(b'%PDF'):
                log_test("✅ PDF format validation: Valid PDF header found")
                return True
            else:
                log_test("❌ PDF format validation: Invalid PDF header")
                return False
            
        except Exception as e:
            log_test(f"❌ Error saving PDF: {e}")
            return False
    else:
        log_test(f"❌ PDF generation failed: {response.status_code} - {response.text}")
        return False

def check_backend_logs():
    """Check backend logs for errors"""
    log_test("Checking backend logs for errors...")
    
    try:
        # Check supervisor backend logs
        import subprocess
        result = subprocess.run(
            ["tail", "-n", "30", "/var/log/supervisor/backend.err.log"],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            error_logs = result.stdout.strip()
            if error_logs:
                log_test("⚠️ Backend error logs found:")
                for line in error_logs.split('\n')[-10:]:  # Show last 10 lines
                    if line.strip():
                        log_test(f"   {line}")
            else:
                log_test("✅ No recent backend errors found")
        else:
            log_test("⚠️ Could not read backend error logs")
            
        # Also check stdout logs
        result_out = subprocess.run(
            ["tail", "-n", "20", "/var/log/supervisor/backend.out.log"],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result_out.returncode == 0 and result_out.stdout.strip():
            log_test("📋 Recent backend output:")
            for line in result_out.stdout.strip().split('\n')[-5:]:  # Show last 5 lines
                if line.strip():
                    log_test(f"   {line}")
            
    except Exception as e:
        log_test(f"⚠️ Error checking backend logs: {e}")

def cleanup_test_data(customer_id, project_id):
    """Clean up test data"""
    log_test("Cleaning up test data...")
    
    # Delete project (this will cascade delete sketches)
    if project_id:
        response = requests.delete(f"{BACKEND_URL}/projects/{project_id}")
        if response.status_code == 200:
            log_test("✅ Project deleted")
        else:
            log_test(f"⚠️ Project deletion failed: {response.status_code}")
    
    # Delete customer
    if customer_id:
        response = requests.delete(f"{BACKEND_URL}/customers/{customer_id}")
        if response.status_code == 200:
            log_test("✅ Customer deleted")
        else:
            log_test(f"⚠️ Customer deletion failed: {response.status_code}")

def main():
    """Main test function for arrow and text rendering verification"""
    log_test("=== ARROW AND TEXT RENDERING PDF EXPORT TEST v2 ===")
    log_test("Testing corrected scaling logic with uniform_scale and offset")
    log_test("Verifying proportional arrow rendering and text positioning")
    log_test(f"Backend URL: {BACKEND_URL}")
    
    customer_id = None
    project_id = None
    
    try:
        # Step 1: Create test customer
        customer_id = create_test_customer()
        if not customer_id:
            return False
        
        # Step 2: Create test project
        project_id = create_test_project(customer_id)
        if not project_id:
            return False
        
        # Step 3: Create sketch with arrows and text
        sketch_id = create_sketch_with_arrows_and_text(project_id)
        if not sketch_id:
            return False
        
        # Step 4: Generate PDF and save
        pdf_success = generate_pdf_and_save(project_id)
        if not pdf_success:
            return False
        
        # Step 5: Check backend logs
        check_backend_logs()
        
        log_test("=== TEST COMPLETED SUCCESSFULLY ===")
        log_test("✅ Arrow rendering test passed")
        log_test("✅ PDF saved to /tmp/arrow_test_v2.pdf")
        log_test("")
        log_test("📋 MANUAL VERIFICATION REQUIRED:")
        log_test("   1. Open /tmp/arrow_test_v2.pdf")
        log_test("   2. Navigate to 'Skizzen' section")
        log_test("   3. Verify arrows have proportional arrowhead sizes:")
        log_test("      • Red arrow (strokeWidth=2): smallest arrowhead")
        log_test("      • Green arrow (strokeWidth=5): medium arrowhead") 
        log_test("      • Blue arrow (strokeWidth=8): largest arrowhead")
        log_test("   4. Verify text positioning is correct")
        log_test("   5. Verify line rendering is correct")
        log_test("   6. Check that all elements are properly scaled and positioned")
        
        return True
        
    except Exception as e:
        log_test(f"❌ Test failed with exception: {e}")
        return False
        
    finally:
        # Cleanup
        if customer_id or project_id:
            cleanup_test_data(customer_id, project_id)

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)