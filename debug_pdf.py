#!/usr/bin/env python3
"""
Debug the PDF export function to see why checklists are missing
"""

import requests
import json
import base64
from datetime import datetime

BACKEND_URL = "https://project-sketch-3.preview.emergentagent.com/api"

def debug_pdf_export():
    """Debug PDF export with detailed logging"""
    print("DEBUGGING PDF EXPORT FUNCTION")
    print("="*50)
    
    # Create test data
    customer_data = {
        "name": "Debug Kunde",
        "email": "debug@example.com",
        "phone": "+49 123 456789",
        "address": "Debug Straße 1, 12345 Debug Stadt"
    }
    
    customer_response = requests.post(f"{BACKEND_URL}/customers", json=customer_data)
    customer = customer_response.json()
    print(f"Customer created: {customer['id']}")
    
    project_data = {
        "customer_id": customer['id'],
        "name": "Debug Projekt",
        "description": "Debug Beschreibung",
        "status": "active"
    }
    
    project_response = requests.post(f"{BACKEND_URL}/projects", json=project_data)
    project = project_response.json()
    print(f"Project created: {project['id']}")
    
    # Create checklist template
    template_data = {
        "name": "Debug Checkliste",
        "items": [
            "Debug Item 1",
            "Debug Item 2", 
            "Debug Item 3"
        ]
    }
    
    template_response = requests.post(f"{BACKEND_URL}/checklist-templates", json=template_data)
    template = template_response.json()
    print(f"Template created: {template['id']}")
    
    # Create checklist instance
    checklist_data = {
        "project_id": project['id'],
        "template_id": template['id'],
        "template_name": template['name'],
        "items": [
            {"text": "Debug Item 1", "checked": True},
            {"text": "Debug Item 2", "checked": False},
            {"text": "Debug Item 3", "checked": True}
        ]
    }
    
    checklist_response = requests.post(f"{BACKEND_URL}/checklists", json=checklist_data)
    checklist = checklist_response.json()
    print(f"Checklist created: {checklist['id']}")
    
    # Verify all data exists
    print("\nVerifying data exists:")
    
    # Check project
    project_check = requests.get(f"{BACKEND_URL}/projects/{project['id']}")
    print(f"Project exists: {project_check.status_code == 200}")
    
    # Check checklists for project
    checklists_check = requests.get(f"{BACKEND_URL}/checklists/project/{project['id']}")
    checklists_data = checklists_check.json()
    print(f"Checklists for project: {len(checklists_data)} found")
    
    if checklists_data:
        print(f"Checklist data: {json.dumps(checklists_data[0], indent=2)}")
    
    # Generate PDF
    print("\nGenerating PDF...")
    pdf_response = requests.get(f"{BACKEND_URL}/export/pdf/{project['id']}")
    
    if pdf_response.status_code == 200:
        pdf_data = pdf_response.json()
        pdf_bytes = base64.b64decode(pdf_data['pdf_data'])
        
        print(f"PDF size: {len(pdf_bytes)} bytes")
        
        # Check PDF content
        pdf_text = pdf_bytes.decode('latin-1', errors='ignore')
        
        # Look for various checklist-related strings
        checklist_indicators = [
            'Checklisten',
            'Debug Checkliste', 
            'Debug Item',
            'checklist',
            '✓',
            '○'
        ]
        
        print("\nChecking PDF content for checklist indicators:")
        for indicator in checklist_indicators:
            found = indicator in pdf_text
            print(f"  '{indicator}': {found}")
        
        # Save PDF for manual inspection
        with open('/app/debug_pdf.pdf', 'wb') as f:
            f.write(pdf_bytes)
        print("\nPDF saved as /app/debug_pdf.pdf")
        
        # Check if PDF has multiple pages (checklists should be on separate page)
        page_count = pdf_text.count('/Type /Page')
        print(f"PDF page count: {page_count}")
        
    else:
        print(f"PDF generation failed: {pdf_response.status_code} - {pdf_response.text}")
    
    # Cleanup
    requests.delete(f"{BACKEND_URL}/projects/{project['id']}")
    requests.delete(f"{BACKEND_URL}/customers/{customer['id']}")

if __name__ == "__main__":
    debug_pdf_export()