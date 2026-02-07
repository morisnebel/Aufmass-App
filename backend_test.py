#!/usr/bin/env python3
"""
Backend API Test Suite for Aufmaß-App (Measurement App)
Tests all CRUD operations and complete workflow
"""

import requests
import json
import base64
import os
from datetime import datetime
from typing import Dict, Any, Optional

# Get backend URL from environment
BACKEND_URL = "https://sketch-pdf-tools.preview.emergentagent.com/api"

class AufmassAPITester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.session = requests.Session()
        self.test_data = {}
        self.errors = []
        self.successes = []
        
    def log_success(self, message: str):
        print(f"✅ {message}")
        self.successes.append(message)
        
    def log_error(self, message: str, error: Exception = None):
        error_msg = f"❌ {message}"
        if error:
            error_msg += f" - Error: {str(error)}"
        print(error_msg)
        self.errors.append(error_msg)
        
    def make_request(self, method: str, endpoint: str, data: Dict = None, expected_status: int = 200) -> Optional[Dict]:
        """Make HTTP request and handle response"""
        url = f"{self.base_url}{endpoint}"
        try:
            if method.upper() == 'GET':
                response = self.session.get(url)
            elif method.upper() == 'POST':
                response = self.session.post(url, json=data)
            elif method.upper() == 'PUT':
                response = self.session.put(url, json=data)
            elif method.upper() == 'DELETE':
                response = self.session.delete(url)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            if response.status_code == expected_status:
                if response.content:
                    return response.json()
                return {}
            else:
                self.log_error(f"{method} {endpoint} returned status {response.status_code}, expected {expected_status}")
                if response.content:
                    print(f"Response: {response.text}")
                return None
                
        except Exception as e:
            self.log_error(f"{method} {endpoint} failed", e)
            return None
    
    def create_sample_base64_image(self) -> str:
        """Create a simple base64 encoded image for testing"""
        # Simple 1x1 pixel PNG in base64
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    
    def test_customers_crud(self):
        """Test Customer CRUD operations"""
        print("\n🔍 Testing Customer CRUD Operations...")
        
        # 1. Create Customer
        customer_data = {
            "name": "Max Mustermann",
            "email": "max.mustermann@example.com",
            "phone": "+49 123 456789",
            "address": "Musterstraße 123, 12345 Musterstadt"
        }
        
        customer = self.make_request('POST', '/customers', customer_data, 200)
        if customer:
            self.test_data['customer_id'] = customer['id']
            self.log_success(f"Customer created with ID: {customer['id']}")
        else:
            return False
            
        # 2. Get all customers
        customers = self.make_request('GET', '/customers')
        if customers and len(customers) > 0:
            self.log_success(f"Retrieved {len(customers)} customers")
        else:
            self.log_error("Failed to retrieve customers")
            
        # 3. Get single customer
        customer_id = self.test_data['customer_id']
        customer = self.make_request('GET', f'/customers/{customer_id}')
        if customer and customer['name'] == customer_data['name']:
            self.log_success(f"Retrieved customer: {customer['name']}")
        else:
            self.log_error("Failed to retrieve single customer")
            
        # 4. Update customer
        update_data = customer_data.copy()
        update_data['phone'] = "+49 987 654321"
        updated_customer = self.make_request('PUT', f'/customers/{customer_id}', update_data)
        if updated_customer and updated_customer['phone'] == update_data['phone']:
            self.log_success("Customer updated successfully")
        else:
            self.log_error("Failed to update customer")
            
        return True
    
    def test_projects_crud(self):
        """Test Project CRUD operations"""
        print("\n🔍 Testing Project CRUD Operations...")
        
        if 'customer_id' not in self.test_data:
            self.log_error("Customer ID not available for project testing")
            return False
            
        # 1. Create Project
        project_data = {
            "customer_id": self.test_data['customer_id'],
            "name": "Dachsanierung Einfamilienhaus",
            "description": "Komplette Dachsanierung mit Photovoltaik",
            "status": "active"
        }
        
        project = self.make_request('POST', '/projects', project_data, 200)
        if project:
            self.test_data['project_id'] = project['id']
            self.log_success(f"Project created with ID: {project['id']}")
        else:
            return False
            
        # 2. Get all projects
        projects = self.make_request('GET', '/projects')
        if projects and len(projects) > 0:
            self.log_success(f"Retrieved {len(projects)} projects")
        else:
            self.log_error("Failed to retrieve projects")
            
        # 3. Get single project
        project_id = self.test_data['project_id']
        project = self.make_request('GET', f'/projects/{project_id}')
        if project and project['name'] == project_data['name']:
            self.log_success(f"Retrieved project: {project['name']}")
        else:
            self.log_error("Failed to retrieve single project")
            
        # 4. Update project
        update_data = project_data.copy()
        update_data['status'] = "completed"
        updated_project = self.make_request('PUT', f'/projects/{project_id}', update_data)
        if updated_project and updated_project['status'] == "completed":
            self.log_success("Project updated successfully")
        else:
            self.log_error("Failed to update project")
            
        return True
    
    def test_roofs_crud(self):
        """Test Roof Measurements CRUD operations"""
        print("\n🔍 Testing Roof Measurements CRUD Operations...")
        
        if 'project_id' not in self.test_data:
            self.log_error("Project ID not available for roof testing")
            return False
            
        # 1. Create Roof Measurement
        roof_data = {
            "project_id": self.test_data['project_id'],
            "roof_type": "Satteldach",
            "measurements": {
                "length": 12.5,
                "width": 8.0,
                "height": 4.2,
                "angle": 35.0
            },
            "area": 100.0,
            "notes": "Südausrichtung, optimal für PV-Anlage"
        }
        
        roof = self.make_request('POST', '/roofs', roof_data, 200)
        if roof:
            self.test_data['roof_id'] = roof['id']
            self.log_success(f"Roof measurement created with ID: {roof['id']}")
        else:
            return False
            
        # 2. Get project roofs
        project_id = self.test_data['project_id']
        roofs = self.make_request('GET', f'/roofs/project/{project_id}')
        if roofs and len(roofs) > 0:
            self.log_success(f"Retrieved {len(roofs)} roof measurements for project")
        else:
            self.log_error("Failed to retrieve project roofs")
            
        # 3. Update roof measurement
        roof_id = self.test_data['roof_id']
        update_data = roof_data.copy()
        update_data['area'] = 105.5
        updated_roof = self.make_request('PUT', f'/roofs/{roof_id}', update_data)
        if updated_roof and updated_roof['area'] == 105.5:
            self.log_success("Roof measurement updated successfully")
        else:
            self.log_error("Failed to update roof measurement")
            
        return True
    
    def test_photos_crud(self):
        """Test Photos CRUD operations"""
        print("\n🔍 Testing Photos CRUD Operations...")
        
        if 'project_id' not in self.test_data:
            self.log_error("Project ID not available for photo testing")
            return False
            
        # 1. Create Photo
        photo_data = {
            "project_id": self.test_data['project_id'],
            "image_data": self.create_sample_base64_image(),
            "annotations": '{"markers": [{"x": 100, "y": 150, "text": "Schaden"}]}',
            "description": "Dachschaden an der Südseite"
        }
        
        photo = self.make_request('POST', '/photos', photo_data, 200)
        if photo:
            self.test_data['photo_id'] = photo['id']
            self.log_success(f"Photo created with ID: {photo['id']}")
        else:
            return False
            
        # 2. Get project photos
        project_id = self.test_data['project_id']
        photos = self.make_request('GET', f'/photos/project/{project_id}')
        if photos and len(photos) > 0:
            self.log_success(f"Retrieved {len(photos)} photos for project")
        else:
            self.log_error("Failed to retrieve project photos")
            
        # 3. 🎯 TEST PUT ENDPOINT - Update Photo (NEW FUNCTIONALITY)
        print("\n🎯 TESTING PUT ENDPOINT: /api/photos/{photo_id}")
        if 'photo_id' in self.test_data:
            photo_id = self.test_data['photo_id']
            original_photo_id = photo_id
            
            # Updated photo data with new annotations
            updated_photo_data = {
                "project_id": self.test_data['project_id'],
                "image_data": self.create_sample_base64_image(),
                "annotations": '{"markers": [{"x": 100, "y": 150, "text": "Schaden - REPARIERT"}, {"x": 200, "y": 250, "text": "Neue Markierung"}], "version": "2.0"}',
                "description": "Dachschaden an der Südseite - Nach Reparatur"
            }
            
            updated_photo = self.make_request('PUT', f'/photos/{photo_id}', updated_photo_data, 200)
            if updated_photo:
                updated_photo_id = updated_photo['id']
                
                # Verify Photo ID persistence
                if original_photo_id == updated_photo_id:
                    self.log_success("PUT endpoint: Photo ID remained the same after update")
                else:
                    self.log_error(f"PUT endpoint: Photo ID changed! Original: {original_photo_id}, Updated: {updated_photo_id}")
                    return False
                
                # Verify annotations were updated
                if '"version": "2.0"' in updated_photo.get('annotations', ''):
                    self.log_success("PUT endpoint: Annotations updated correctly")
                else:
                    self.log_error("PUT endpoint: Annotations not updated properly")
                    return False
                    
                # Verify description was updated
                if updated_photo.get('description') == "Dachschaden an der Südseite - Nach Reparatur":
                    self.log_success("PUT endpoint: Description updated correctly")
                else:
                    self.log_error(f"PUT endpoint: Description not updated. Got: {updated_photo.get('description')}")
                    
                self.log_success("PUT /api/photos/{photo_id} endpoint working correctly")
            else:
                self.log_error("PUT endpoint failed to update photo")
                return False
        else:
            self.log_error("Photo ID not available for PUT testing")
            return False
            
        return True
    
    def test_sketches_crud(self):
        """Test Sketches CRUD operations"""
        print("\n🔍 Testing Sketches CRUD Operations...")
        
        if 'project_id' not in self.test_data:
            self.log_error("Project ID not available for sketch testing")
            return False
            
        # 1. Create Sketch
        sketch_data = {
            "project_id": self.test_data['project_id'],
            "sketch_data": self.create_sample_base64_image(),
            "title": "Grundriss Dachgeschoss"
        }
        
        sketch = self.make_request('POST', '/sketches', sketch_data, 200)
        if sketch:
            self.test_data['sketch_id'] = sketch['id']
            self.log_success(f"Sketch created with ID: {sketch['id']}")
        else:
            return False
            
        # 2. Get project sketches
        project_id = self.test_data['project_id']
        sketches = self.make_request('GET', f'/sketches/project/{project_id}')
        if sketches and len(sketches) > 0:
            self.log_success(f"Retrieved {len(sketches)} sketches for project")
        else:
            self.log_error("Failed to retrieve project sketches")
            
        return True
    
    def test_checklist_templates_crud(self):
        """Test Checklist Templates CRUD operations"""
        print("\n🔍 Testing Checklist Templates CRUD Operations...")
        
        # 1. Create Checklist Template
        template_data = {
            "name": "Standard Dachinspektion",
            "items": [
                "Dachziegel auf Beschädigungen prüfen",
                "Regenrinnen kontrollieren",
                "Dachfenster überprüfen",
                "Schornstein inspizieren",
                "Blitzableiter kontrollieren"
            ]
        }
        
        template = self.make_request('POST', '/checklist-templates', template_data, 200)
        if template:
            self.test_data['template_id'] = template['id']
            self.log_success(f"Checklist template created with ID: {template['id']}")
        else:
            return False
            
        # 2. Get all templates
        templates = self.make_request('GET', '/checklist-templates')
        if templates and len(templates) > 0:
            self.log_success(f"Retrieved {len(templates)} checklist templates")
        else:
            self.log_error("Failed to retrieve checklist templates")
            
        return True
    
    def test_checklists_crud(self):
        """Test Checklists CRUD operations"""
        print("\n🔍 Testing Checklists CRUD Operations...")
        
        if 'project_id' not in self.test_data or 'template_id' not in self.test_data:
            self.log_error("Project ID or Template ID not available for checklist testing")
            return False
            
        # 1. Create Checklist from Template
        checklist_data = {
            "project_id": self.test_data['project_id'],
            "template_id": self.test_data['template_id'],
            "template_name": "Standard Dachinspektion",
            "items": [
                {"text": "Dachziegel auf Beschädigungen prüfen", "checked": True},
                {"text": "Regenrinnen kontrollieren", "checked": True},
                {"text": "Dachfenster überprüfen", "checked": False},
                {"text": "Schornstein inspizieren", "checked": False},
                {"text": "Blitzableiter kontrollieren", "checked": True}
            ]
        }
        
        checklist = self.make_request('POST', '/checklists', checklist_data, 200)
        if checklist:
            self.test_data['checklist_id'] = checklist['id']
            self.log_success(f"Checklist created with ID: {checklist['id']}")
        else:
            return False
            
        # 2. Get project checklists
        project_id = self.test_data['project_id']
        checklists = self.make_request('GET', f'/checklists/project/{project_id}')
        if checklists and len(checklists) > 0:
            self.log_success(f"Retrieved {len(checklists)} checklists for project")
        else:
            self.log_error("Failed to retrieve project checklists")
            
        # 3. Update checklist
        checklist_id = self.test_data['checklist_id']
        update_data = checklist_data.copy()
        update_data['items'][2]['checked'] = True  # Mark third item as checked
        updated_checklist = self.make_request('PUT', f'/checklists/{checklist_id}', update_data)
        if updated_checklist and updated_checklist['items'][2]['checked']:
            self.log_success("Checklist updated successfully")
        else:
            self.log_error("Failed to update checklist")
            
        return True
    
    def test_pdf_export(self):
        """Test PDF Export functionality"""
        print("\n🔍 Testing PDF Export...")
        
        if 'project_id' not in self.test_data:
            self.log_error("Project ID not available for PDF export testing")
            return False
            
        project_id = self.test_data['project_id']
        pdf_response = self.make_request('GET', f'/export/pdf/{project_id}')
        
        if pdf_response and 'pdf_data' in pdf_response:
            # Verify it's valid base64
            try:
                pdf_bytes = base64.b64decode(pdf_response['pdf_data'])
                if pdf_bytes.startswith(b'%PDF'):
                    self.log_success(f"PDF export successful - {pdf_response.get('filename', 'unknown.pdf')}")
                    return True
                else:
                    self.log_error("PDF export returned invalid PDF data")
            except Exception as e:
                self.log_error("PDF export returned invalid base64 data", e)
        else:
            self.log_error("PDF export failed")
            
        return False
    
    def test_delete_operations(self):
        """Test DELETE operations (cleanup)"""
        print("\n🔍 Testing DELETE Operations...")
        
        # Delete in reverse order of creation to maintain referential integrity
        
        # 1. Delete checklist
        if 'checklist_id' in self.test_data:
            result = self.make_request('DELETE', f'/checklists/{self.test_data["checklist_id"]}')
            if result:
                self.log_success("Checklist deleted successfully")
            else:
                self.log_error("Failed to delete checklist")
        
        # 2. Delete checklist template
        if 'template_id' in self.test_data:
            result = self.make_request('DELETE', f'/checklist-templates/{self.test_data["template_id"]}')
            if result:
                self.log_success("Checklist template deleted successfully")
            else:
                self.log_error("Failed to delete checklist template")
        
        # 3. Delete sketch
        if 'sketch_id' in self.test_data:
            result = self.make_request('DELETE', f'/sketches/{self.test_data["sketch_id"]}')
            if result:
                self.log_success("Sketch deleted successfully")
            else:
                self.log_error("Failed to delete sketch")
        
        # 4. Delete photo
        if 'photo_id' in self.test_data:
            result = self.make_request('DELETE', f'/photos/{self.test_data["photo_id"]}')
            if result:
                self.log_success("Photo deleted successfully")
            else:
                self.log_error("Failed to delete photo")
        
        # 5. Delete roof
        if 'roof_id' in self.test_data:
            result = self.make_request('DELETE', f'/roofs/{self.test_data["roof_id"]}')
            if result:
                self.log_success("Roof measurement deleted successfully")
            else:
                self.log_error("Failed to delete roof measurement")
        
        # 6. Delete project (this should cascade delete related data)
        if 'project_id' in self.test_data:
            result = self.make_request('DELETE', f'/projects/{self.test_data["project_id"]}')
            if result:
                self.log_success("Project deleted successfully (with cascade)")
            else:
                self.log_error("Failed to delete project")
        
        # 7. Delete customer
        if 'customer_id' in self.test_data:
            result = self.make_request('DELETE', f'/customers/{self.test_data["customer_id"]}')
            if result:
                self.log_success("Customer deleted successfully")
            else:
                self.log_error("Failed to delete customer")
    
    def run_complete_workflow_test(self):
        """Run the complete workflow test as requested"""
        print("🚀 Starting Complete Aufmaß-App Backend API Test Suite")
        print(f"Backend URL: {self.base_url}")
        print("=" * 80)
        
        # Test sequence following the complete workflow
        test_results = []
        
        test_results.append(self.test_customers_crud())
        test_results.append(self.test_projects_crud())
        test_results.append(self.test_roofs_crud())
        test_results.append(self.test_photos_crud())
        test_results.append(self.test_sketches_crud())
        test_results.append(self.test_checklist_templates_crud())
        test_results.append(self.test_checklists_crud())
        test_results.append(self.test_pdf_export())
        
        # Cleanup
        self.test_delete_operations()
        
        # Summary
        print("\n" + "=" * 80)
        print("📊 TEST SUMMARY")
        print("=" * 80)
        
        print(f"✅ Successful operations: {len(self.successes)}")
        print(f"❌ Failed operations: {len(self.errors)}")
        
        if self.errors:
            print("\n🔴 ERRORS ENCOUNTERED:")
            for error in self.errors:
                print(f"  {error}")
        
        if self.successes:
            print(f"\n🟢 SUCCESSFUL OPERATIONS: {len(self.successes)}")
        
        overall_success = len(self.errors) == 0
        print(f"\n🎯 OVERALL RESULT: {'✅ ALL TESTS PASSED' if overall_success else '❌ SOME TESTS FAILED'}")
        
        return overall_success

def main():
    """Main test execution"""
    tester = AufmassAPITester()
    success = tester.run_complete_workflow_test()
    return 0 if success else 1

if __name__ == "__main__":
    exit(main())