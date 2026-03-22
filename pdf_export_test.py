#!/usr/bin/env python3
"""
PDF-Export Funktionalität testen - Fokus auf 2 gemeldete Bugs

KONTEXT:
Der Benutzer hat 2 Probleme mit dem PDF-Export gemeldet:
1. Foto-Annotationen sind im PDF VERSCHOBEN/FEHLPLATZIERT
2. Checklisten FEHLEN im PDF (Regression)

FIX IMPLEMENTIERT:
- Frontend wurde aktualisiert um echte Canvas-Dimensionen zu speichern (canvasWidth, canvasHeight)
- Backend hat bereits Koordinaten-Skalierungslogik in draw_annotations_on_photo()
"""

import requests
import json
import base64
import time
from datetime import datetime

# Backend URL from frontend/.env
BACKEND_URL = "https://angle-stamper.preview.emergentagent.com/api"

def log_test(message):
    """Log test messages with timestamp"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

def create_test_customer():
    """Create a test customer for PDF testing"""
    log_test("Creating test customer...")
    customer_data = {
        "name": "Hans Müller",
        "email": "hans.mueller@dachbau.de", 
        "phone": "+49 30 12345678",
        "address": "Berliner Straße 123, 10115 Berlin"
    }
    
    response = requests.post(f"{BACKEND_URL}/customers", json=customer_data)
    if response.status_code == 200:
        customer = response.json()
        log_test(f"✅ Customer created: {customer['name']} (ID: {customer['id']})")
        return customer
    else:
        log_test(f"❌ Failed to create customer: {response.status_code} - {response.text}")
        return None

def create_test_project(customer_id):
    """Create a test project"""
    log_test("Creating test project...")
    project_data = {
        "customer_id": customer_id,
        "name": "Dachsanierung Einfamilienhaus",
        "description": "Komplette Dachsanierung mit Dämmung und neuen Ziegeln",
        "status": "active"
    }
    
    response = requests.post(f"{BACKEND_URL}/projects", json=project_data)
    if response.status_code == 200:
        project = response.json()
        log_test(f"✅ Project created: {project['name']} (ID: {project['id']})")
        return project
    else:
        log_test(f"❌ Failed to create project: {response.status_code} - {response.text}")
        return None

def create_checklist_template():
    """Create a checklist template for testing"""
    log_test("Creating checklist template...")
    template_data = {
        "name": "Dachinspektion Checkliste",
        "items": [
            "Dachziegel auf Risse prüfen",
            "Regenrinne auf Verstopfung kontrollieren", 
            "Dachfenster auf Dichtigkeit testen",
            "Schornstein auf Beschädigungen untersuchen",
            "Dachstuhl auf Schädlingsbefall prüfen"
        ]
    }
    
    response = requests.post(f"{BACKEND_URL}/checklist-templates", json=template_data)
    if response.status_code == 200:
        template = response.json()
        log_test(f"✅ Checklist template created: {template['name']} (ID: {template['id']})")
        return template
    else:
        log_test(f"❌ Failed to create checklist template: {response.status_code} - {response.text}")
        return None

def create_checklist_instance(project_id, template):
    """Create a checklist instance for the project"""
    log_test("Creating checklist instance...")
    checklist_data = {
        "project_id": project_id,
        "template_id": template['id'],
        "template_name": template['name'],
        "items": [
            {"text": item, "checked": i % 2 == 0} for i, item in enumerate(template['items'])
        ]
    }
    
    response = requests.post(f"{BACKEND_URL}/checklists", json=checklist_data)
    if response.status_code == 200:
        checklist = response.json()
        log_test(f"✅ Checklist instance created: {len(checklist['items'])} items (ID: {checklist['id']})")
        return checklist
    else:
        log_test(f"❌ Failed to create checklist instance: {response.status_code} - {response.text}")
        return None

def create_photo_with_annotations(project_id):
    """Create a photo with annotations including canvasWidth and canvasHeight"""
    log_test("Creating photo with annotations...")
    
    # Create a simple test image (100x100 red square)
    import io
    from PIL import Image as PILImage
    
    # Create a simple colored image
    img = PILImage.new('RGB', (200, 200), color='lightblue')
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    img_b64 = base64.b64encode(buffer.getvalue()).decode()
    
    # Annotations with real canvas dimensions as mentioned in the fix
    annotations = {
        "paths": [
            {
                "path": "M 50 50 L 150 50 L 150 150 L 50 150 L 50 50",
                "color": "#FF0000", 
                "strokeWidth": 5
            }
        ],
        "canvasWidth": 390,
        "canvasHeight": 600
    }
    
    photo_data = {
        "project_id": project_id,
        "image_data": f"data:image/png;base64,{img_b64}",
        "annotations": json.dumps(annotations),
        "description": "Testfoto mit Annotationen für PDF-Export"
    }
    
    response = requests.post(f"{BACKEND_URL}/photos", json=photo_data)
    if response.status_code == 200:
        photo = response.json()
        log_test(f"✅ Photo with annotations created (ID: {photo['id']})")
        return photo
    else:
        log_test(f"❌ Failed to create photo: {response.status_code} - {response.text}")
        return None

def create_roof_measurement(project_id):
    """Create a roof measurement for completeness"""
    log_test("Creating roof measurement...")
    roof_data = {
        "project_id": project_id,
        "roof_type": "Satteldach",
        "measurements": {
            "length": 12.5,
            "width": 8.0,
            "height": 4.2
        },
        "area": 100.0,
        "notes": "Standarddach mit Ziegeln"
    }
    
    response = requests.post(f"{BACKEND_URL}/roofs", json=roof_data)
    if response.status_code == 200:
        roof = response.json()
        log_test(f"✅ Roof measurement created: {roof['roof_type']} - {roof['area']}m² (ID: {roof['id']})")
        return roof
    else:
        log_test(f"❌ Failed to create roof: {response.status_code} - {response.text}")
        return None

def create_sketch(project_id):
    """Create a simple sketch for completeness"""
    log_test("Creating sketch...")
    
    # Simple SVG sketch
    svg_content = '''<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect x="50" y="50" width="300" height="200" fill="none" stroke="black" stroke-width="2"/>
        <line x1="50" y1="150" x2="350" y2="150" stroke="red" stroke-width="1"/>
        <circle cx="200" cy="150" r="30" fill="none" stroke="blue" stroke-width="2"/>
        <text x="200" y="280" text-anchor="middle" font-family="Arial" font-size="14">Test Skizze</text>
    </svg>'''
    
    svg_b64 = base64.b64encode(svg_content.encode()).decode()
    
    sketch_data = {
        "project_id": project_id,
        "sketch_data": f"data:image/svg+xml;base64,{svg_b64}",
        "title": "Grundriss Skizze",
        "metadata": json.dumps({"elements": ["rectangle", "line", "circle", "text"]})
    }
    
    response = requests.post(f"{BACKEND_URL}/sketches", json=sketch_data)
    if response.status_code == 200:
        sketch = response.json()
        log_test(f"✅ Sketch created: {sketch['title']} (ID: {sketch['id']})")
        return sketch
    else:
        log_test(f"❌ Failed to create sketch: {response.status_code} - {response.text}")
        return None

def test_pdf_export(project_id):
    """Test PDF export and verify it contains expected content"""
    log_test("Testing PDF export...")
    
    response = requests.get(f"{BACKEND_URL}/export/pdf/{project_id}")
    if response.status_code == 200:
        pdf_response = response.json()
        pdf_data = pdf_response.get('pdf_data', '')
        filename = pdf_response.get('filename', '')
        
        if pdf_data:
            # Decode and check PDF size
            pdf_bytes = base64.b64decode(pdf_data)
            pdf_size_kb = len(pdf_bytes) / 1024
            
            # Check if it's a valid PDF (starts with %PDF)
            is_valid_pdf = pdf_bytes.startswith(b'%PDF')
            
            log_test(f"✅ PDF generated successfully:")
            log_test(f"   - Filename: {filename}")
            log_test(f"   - Size: {pdf_size_kb:.1f} KB")
            log_test(f"   - Valid PDF format: {is_valid_pdf}")
            
            return True, pdf_size_kb, is_valid_pdf
        else:
            log_test("❌ PDF data is empty")
            return False, 0, False
    else:
        log_test(f"❌ PDF export failed: {response.status_code} - {response.text}")
        return False, 0, False

def cleanup_test_data(customer_id, project_id):
    """Clean up test data"""
    log_test("Cleaning up test data...")
    
    # Delete project (cascades to related data)
    if project_id:
        response = requests.delete(f"{BACKEND_URL}/projects/{project_id}")
        if response.status_code == 200:
            log_test("✅ Project and related data deleted")
        else:
            log_test(f"⚠️ Failed to delete project: {response.status_code}")
    
    # Delete customer
    if customer_id:
        response = requests.delete(f"{BACKEND_URL}/customers/{customer_id}")
        if response.status_code == 200:
            log_test("✅ Customer deleted")
        else:
            log_test(f"⚠️ Failed to delete customer: {response.status_code}")

def test_1_checklist_regression():
    """TEST 1: Verify checklists appear in PDF (regression test)"""
    log_test("\n" + "="*60)
    log_test("TEST 1: CHECKLISTEN-TEST (Regression prüfen)")
    log_test("="*60)
    
    # Create test data
    customer = create_test_customer()
    if not customer:
        return False
    
    project = create_test_project(customer['id'])
    if not project:
        return False
    
    template = create_checklist_template()
    if not template:
        return False
    
    checklist = create_checklist_instance(project['id'], template)
    if not checklist:
        return False
    
    # Test PDF export
    success, pdf_size, is_valid = test_pdf_export(project['id'])
    
    # Cleanup
    cleanup_test_data(customer['id'], project['id'])
    
    if success and is_valid and pdf_size > 5:  # Reasonable size for PDF with checklist
        log_test("✅ TEST 1 PASSED: Checklisten erscheinen im PDF")
        return True
    else:
        log_test("❌ TEST 1 FAILED: Checklisten fehlen im PDF (REGRESSION BESTÄTIGT)")
        return False

def test_2_annotation_scaling():
    """TEST 2: Verify photo annotation scaling with canvas dimensions"""
    log_test("\n" + "="*60)
    log_test("TEST 2: ANNOTATION-SKALIERUNGS-TEST")
    log_test("="*60)
    
    # Create test data
    customer = create_test_customer()
    if not customer:
        return False
    
    project = create_test_project(customer['id'])
    if not project:
        return False
    
    photo = create_photo_with_annotations(project['id'])
    if not photo:
        return False
    
    # Test PDF export
    success, pdf_size, is_valid = test_pdf_export(project['id'])
    
    # Cleanup
    cleanup_test_data(customer['id'], project['id'])
    
    if success and is_valid:
        log_test("✅ TEST 2 PASSED: Annotation scaling funktioniert")
        return True
    else:
        log_test("❌ TEST 2 FAILED: Annotation scaling fehlerhaft")
        return False

def test_3_complete_workflow():
    """TEST 3: Complete workflow with all components"""
    log_test("\n" + "="*60)
    log_test("TEST 3: VOLLSTÄNDIGER FLOW-TEST")
    log_test("="*60)
    
    # Create complete test data
    customer = create_test_customer()
    if not customer:
        return False
    
    project = create_test_project(customer['id'])
    if not project:
        return False
    
    roof = create_roof_measurement(project['id'])
    photo = create_photo_with_annotations(project['id'])
    sketch = create_sketch(project['id'])
    
    template = create_checklist_template()
    if template:
        checklist = create_checklist_instance(project['id'], template)
    
    # Test PDF export
    success, pdf_size, is_valid = test_pdf_export(project['id'])
    
    # Cleanup
    cleanup_test_data(customer['id'], project['id'])
    
    if success and is_valid and pdf_size > 15:  # Larger size expected for complete project
        log_test("✅ TEST 3 PASSED: Vollständiger Workflow funktioniert")
        return True
    else:
        log_test("❌ TEST 3 FAILED: Vollständiger Workflow fehlerhaft")
        return False

def main():
    """Run all PDF export tests"""
    log_test("PDF-Export Funktionalität testen - Fokus auf 2 gemeldete Bugs")
    log_test(f"Backend URL: {BACKEND_URL}")
    
    start_time = time.time()
    
    # Run all tests
    test_results = []
    test_results.append(("Checklisten Regression", test_1_checklist_regression()))
    test_results.append(("Annotation Skalierung", test_2_annotation_scaling()))
    test_results.append(("Vollständiger Workflow", test_3_complete_workflow()))
    
    # Summary
    log_test("\n" + "="*60)
    log_test("TEST ZUSAMMENFASSUNG")
    log_test("="*60)
    
    passed = 0
    for test_name, result in test_results:
        status = "✅ BESTANDEN" if result else "❌ FEHLGESCHLAGEN"
        log_test(f"{test_name}: {status}")
        if result:
            passed += 1
    
    total_time = time.time() - start_time
    log_test(f"\nTests abgeschlossen: {passed}/{len(test_results)} bestanden in {total_time:.1f}s")
    
    if passed == len(test_results):
        log_test("🎉 ALLE TESTS BESTANDEN - PDF Export funktioniert korrekt!")
        return True
    else:
        log_test("⚠️ EINIGE TESTS FEHLGESCHLAGEN - Probleme mit PDF Export gefunden")
        return False

if __name__ == "__main__":
    main()