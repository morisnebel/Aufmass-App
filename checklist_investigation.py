#!/usr/bin/env python3
"""
Detailed investigation of checklist regression in PDF export
"""

import requests
import json
import base64
from datetime import datetime

BACKEND_URL = "https://canvas-typeface-test.preview.emergentagent.com/api"

def log_test(message):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

def investigate_checklist_issue():
    """Investigate why checklists are missing from PDF"""
    log_test("INVESTIGATING CHECKLIST REGRESSION")
    log_test("="*50)
    
    # Create test data
    customer_data = {
        "name": "Test Kunde",
        "email": "test@example.com",
        "phone": "+49 123 456789",
        "address": "Test Straße 1, 12345 Test Stadt"
    }
    
    customer_response = requests.post(f"{BACKEND_URL}/customers", json=customer_data)
    customer = customer_response.json()
    log_test(f"Customer created: {customer['id']}")
    
    project_data = {
        "customer_id": customer['id'],
        "name": "Test Projekt",
        "description": "Test Beschreibung",
        "status": "active"
    }
    
    project_response = requests.post(f"{BACKEND_URL}/projects", json=project_data)
    project = project_response.json()
    log_test(f"Project created: {project['id']}")
    
    # Create checklist template
    template_data = {
        "name": "Test Checkliste",
        "items": [
            "Item 1 - Test",
            "Item 2 - Test", 
            "Item 3 - Test"
        ]
    }
    
    template_response = requests.post(f"{BACKEND_URL}/checklist-templates", json=template_data)
    template = template_response.json()
    log_test(f"Template created: {template['id']}")
    
    # Create checklist instance
    checklist_data = {
        "project_id": project['id'],
        "template_id": template['id'],
        "template_name": template['name'],
        "items": [
            {"text": "Item 1 - Test", "checked": True},
            {"text": "Item 2 - Test", "checked": False},
            {"text": "Item 3 - Test", "checked": True}
        ]
    }
    
    checklist_response = requests.post(f"{BACKEND_URL}/checklists", json=checklist_data)
    checklist = checklist_response.json()
    log_test(f"Checklist created: {checklist['id']}")
    
    # Verify checklist exists in database
    get_checklists_response = requests.get(f"{BACKEND_URL}/checklists/project/{project['id']}")
    checklists = get_checklists_response.json()
    log_test(f"Checklists found for project: {len(checklists)}")
    
    if checklists:
        log_test(f"Checklist details: {checklists[0]['template_name']} with {len(checklists[0]['items'])} items")
        for i, item in enumerate(checklists[0]['items']):
            status = "✓" if item['checked'] else "○"
            log_test(f"  {status} {item['text']}")
    
    # Generate PDF and check size
    pdf_response = requests.get(f"{BACKEND_URL}/export/pdf/{project['id']}")
    if pdf_response.status_code == 200:
        pdf_data = pdf_response.json()
        pdf_bytes = base64.b64decode(pdf_data['pdf_data'])
        pdf_size = len(pdf_bytes)
        log_test(f"PDF generated: {pdf_size} bytes ({pdf_size/1024:.1f} KB)")
        
        # Save PDF for inspection
        with open('/app/test_pdf.pdf', 'wb') as f:
            f.write(pdf_bytes)
        log_test("PDF saved as /app/test_pdf.pdf for inspection")
        
        # Check if PDF contains checklist text
        pdf_text = pdf_bytes.decode('latin-1', errors='ignore')
        has_checklist_text = 'Checklisten' in pdf_text or 'Test Checkliste' in pdf_text
        log_test(f"PDF contains checklist text: {has_checklist_text}")
        
        if not has_checklist_text:
            log_test("❌ CONFIRMED: Checklists are missing from PDF")
        else:
            log_test("✅ Checklists appear to be in PDF")
    
    # Cleanup
    requests.delete(f"{BACKEND_URL}/projects/{project['id']}")
    requests.delete(f"{BACKEND_URL}/customers/{customer['id']}")
    
    return pdf_size < 5000  # Return True if PDF is suspiciously small

if __name__ == "__main__":
    investigate_checklist_issue()