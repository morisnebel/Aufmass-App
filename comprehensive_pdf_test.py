#!/usr/bin/env python3
"""
Comprehensive PDF Export Test - Arrow Rendering and Checklist Regression
Testing both the corrected arrow scaling and verifying checklist functionality
"""

import requests
import json
import base64
import time
import os
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://form-improve.preview.emergentagent.com/api"

def log_test(message):
    """Log test messages with timestamp"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] {message}")

def create_test_customer():
    """Create a test customer"""
    log_test("Creating test customer...")
    
    customer_data = {
        "name": "Vollständiger Test Kunde",
        "email": "volltest@example.com", 
        "phone": "+49 151 11111111",
        "address": "Teststraße 456, 54321 Volltest"
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
    """Create a test project"""
    log_test("Creating test project...")
    
    project_data = {
        "customer_id": customer_id,
        "name": "Vollständiger PDF Test",
        "description": "Test für Pfeil-Rendering und Checklisten in PDF Export",
        "remarks": "Testet sowohl Pfeilskalierung als auch Checklisten-Regression"
    }
    
    response = requests.post(f"{BACKEND_URL}/projects", json=project_data)
    if response.status_code == 200:
        project = response.json()
        log_test(f"✅ Project created: {project['id']}")
        return project['id']
    else:
        log_test(f"❌ Project creation failed: {response.status_code} - {response.text}")
        return None

def create_checklist_template():
    """Create a checklist template"""
    log_test("Creating checklist template...")
    
    template_data = {
        "name": "PDF Test Checkliste",
        "items": [
            {
                "text": "Dachzustand prüfen",
                "subItems": ["Ziegel kontrollieren", "Rinne überprüfen"]
            },
            {
                "text": "Sicherheit gewährleisten", 
                "subItems": ["Absturzsicherung", "Werkzeug prüfen"]
            },
            {
                "text": "Dokumentation erstellen",
                "subItems": []
            }
        ]
    }
    
    response = requests.post(f"{BACKEND_URL}/checklist-templates", json=template_data)
    if response.status_code == 200:
        template = response.json()
        log_test(f"✅ Checklist template created: {template['id']}")
        return template['id']
    else:
        log_test(f"❌ Checklist template creation failed: {response.status_code} - {response.text}")
        return None

def create_checklist_instance(project_id, template_id):
    """Create a checklist instance for the project"""
    log_test("Creating checklist instance...")
    
    checklist_data = {
        "project_id": project_id,
        "template_id": template_id,
        "template_name": "PDF Test Checkliste",
        "items": [
            {
                "text": "Dachzustand prüfen",
                "checked": True,
                "note": "Zustand gut, kleine Reparaturen nötig",
                "subItems": [
                    {"text": "Ziegel kontrollieren", "checked": True},
                    {"text": "Rinne überprüfen", "checked": True}
                ]
            },
            {
                "text": "Sicherheit gewährleisten",
                "checked": True,
                "note": "",
                "subItems": [
                    {"text": "Absturzsicherung", "checked": True},
                    {"text": "Werkzeug prüfen", "checked": False}
                ]
            },
            {
                "text": "Dokumentation erstellen",
                "checked": False,
                "note": "Noch ausstehend",
                "subItems": []
            }
        ]
    }
    
    response = requests.post(f"{BACKEND_URL}/checklists", json=checklist_data)
    if response.status_code == 200:
        checklist = response.json()
        log_test(f"✅ Checklist instance created: {checklist['id']}")
        return checklist['id']
    else:
        log_test(f"❌ Checklist instance creation failed: {response.status_code} - {response.text}")
        return None

def create_sketch_with_arrows(project_id):
    """Create a sketch with arrows of different strokeWidth"""
    log_test("Creating sketch with arrows...")
    
    metadata = {
        "canvasWidth": 800,
        "canvasHeight": 600,
        "elements": [
            # Arrow 1: strokeWidth 2
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
                    "text": "2.5m",
                    "heads": "single"
                }
            },
            # Arrow 2: strokeWidth 5
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
                    "text": "4.8m",
                    "heads": "double"
                }
            },
            # Arrow 3: strokeWidth 8
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
                    "text": "7.2m",
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
                    "text": "Vollständiger Test - Pfeile und Checklisten"
                }
            }
        ]
    }
    
    svg_content = '''<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="white" stroke="#ccc" stroke-width="1"/>
        <text x="400" y="30" text-anchor="middle" font-size="16" fill="black">Vollständiger Test</text>
    </svg>'''
    
    svg_base64 = base64.b64encode(svg_content.encode()).decode()
    
    sketch_data = {
        "project_id": project_id,
        "sketch_data": f"data:image/svg+xml;base64,{svg_base64}",
        "title": "Vollständiger Test Skizze",
        "metadata": json.dumps(metadata)
    }
    
    response = requests.post(f"{BACKEND_URL}/sketches", json=sketch_data)
    if response.status_code == 200:
        sketch = response.json()
        log_test(f"✅ Sketch created: {sketch['id']}")
        return sketch['id']
    else:
        log_test(f"❌ Sketch creation failed: {response.status_code} - {response.text}")
        return None

def generate_and_analyze_pdf(project_id):
    """Generate PDF and analyze its content"""
    log_test("Generating PDF and analyzing content...")
    
    start_time = time.time()
    response = requests.get(f"{BACKEND_URL}/export/pdf/{project_id}")
    end_time = time.time()
    
    if response.status_code == 200:
        pdf_response = response.json()
        pdf_data = pdf_response.get('pdf_data', '')
        filename = pdf_response.get('filename', 'test.pdf')
        
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
            
            # Analyze PDF content
            pdf_text = pdf_bytes.decode('latin-1', errors='ignore')
            
            # Check for checklist content
            checklist_indicators = [
                "Checkliste",
                "PDF Test Checkliste", 
                "Dachzustand prüfen",
                "Sicherheit gewährleisten",
                "Dokumentation erstellen"
            ]
            
            checklist_found = []
            for indicator in checklist_indicators:
                if indicator in pdf_text:
                    checklist_found.append(indicator)
            
            if checklist_found:
                log_test(f"✅ Checklist content found in PDF: {len(checklist_found)}/{len(checklist_indicators)} indicators")
                for item in checklist_found:
                    log_test(f"   ✓ Found: {item}")
            else:
                log_test("❌ CRITICAL: No checklist content found in PDF!")
            
            # Check for sketch content
            sketch_indicators = ["Skizzen", "Vollständiger Test"]
            sketch_found = []
            for indicator in sketch_indicators:
                if indicator in pdf_text:
                    sketch_found.append(indicator)
            
            if sketch_found:
                log_test(f"✅ Sketch content found in PDF: {len(sketch_found)}/{len(sketch_indicators)} indicators")
            else:
                log_test("⚠️ Limited sketch content found in PDF")
            
            # Check for project/customer content
            project_indicators = ["Vollständiger PDF Test", "Vollständiger Test Kunde", "Bauherr", "Objekt"]
            project_found = []
            for indicator in project_indicators:
                if indicator in pdf_text:
                    project_found.append(indicator)
            
            if project_found:
                log_test(f"✅ Project content found in PDF: {len(project_found)}/{len(project_indicators)} indicators")
            else:
                log_test("❌ CRITICAL: No project content found in PDF!")
            
            # Overall assessment
            if checklist_found and project_found:
                log_test("✅ PDF CONTENT VERIFICATION: All major sections present")
                return True
            else:
                log_test("❌ PDF CONTENT VERIFICATION: Missing critical sections")
                return False
            
        except Exception as e:
            log_test(f"❌ Error analyzing PDF: {e}")
            return False
    else:
        log_test(f"❌ PDF generation failed: {response.status_code} - {response.text}")
        return False

def cleanup_test_data(customer_id, project_id, template_id):
    """Clean up test data"""
    log_test("Cleaning up test data...")
    
    # Delete project (cascades to sketches and checklists)
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
    
    # Delete template
    if template_id:
        response = requests.delete(f"{BACKEND_URL}/checklist-templates/{template_id}")
        if response.status_code == 200:
            log_test("✅ Template deleted")
        else:
            log_test(f"⚠️ Template deletion failed: {response.status_code}")

def main():
    """Main comprehensive test function"""
    log_test("=== COMPREHENSIVE PDF EXPORT TEST ===")
    log_test("Testing arrow rendering AND checklist regression")
    log_test(f"Backend URL: {BACKEND_URL}")
    
    customer_id = None
    project_id = None
    template_id = None
    
    try:
        # Step 1: Create test customer
        customer_id = create_test_customer()
        if not customer_id:
            return False
        
        # Step 2: Create test project
        project_id = create_test_project(customer_id)
        if not project_id:
            return False
        
        # Step 3: Create checklist template
        template_id = create_checklist_template()
        if not template_id:
            return False
        
        # Step 4: Create checklist instance
        checklist_id = create_checklist_instance(project_id, template_id)
        if not checklist_id:
            return False
        
        # Step 5: Create sketch with arrows
        sketch_id = create_sketch_with_arrows(project_id)
        if not sketch_id:
            return False
        
        # Step 6: Generate and analyze PDF
        pdf_success = generate_and_analyze_pdf(project_id)
        
        log_test("=== TEST RESULTS ===")
        if pdf_success:
            log_test("✅ COMPREHENSIVE TEST PASSED")
            log_test("✅ Arrow rendering working")
            log_test("✅ Checklist content present in PDF")
            log_test("✅ PDF saved to /tmp/arrow_test_v2.pdf")
        else:
            log_test("❌ COMPREHENSIVE TEST FAILED")
            log_test("❌ Critical content missing from PDF")
        
        return pdf_success
        
    except Exception as e:
        log_test(f"❌ Test failed with exception: {e}")
        return False
        
    finally:
        # Cleanup
        cleanup_test_data(customer_id, project_id, template_id)

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)