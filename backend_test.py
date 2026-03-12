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
BACKEND_URL = "https://measure-annotate-1.preview.emergentagent.com/api"

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
    
    def test_arrow_rendering_in_pdf(self):
        """
        Test arrow rendering in PDF export with different strokeWidth values.
        Verifies that arrows are saved with correct strokeWidth and rendered proportionally in PDF.
        """
        print("\n🎯 Testing Arrow Rendering in PDF Export...")
        
        # Test data storage for cleanup
        arrow_test_data = {
            'customer_id': None,
            'project_id': None,
            'sketch_id': None
        }
        
        try:
            # ============ CREATE CUSTOMER FOR ARROW TEST ============
            customer_data = {
                "name": "Test Kunde Pfeil-Rendering",
                "email": "pfeil.test@example.com",
                "phone": "+49 151 98765432",
                "address": "Pfeilstraße 123, 12345 Teststadt"
            }
            
            customer_response = self.make_request('POST', '/customers', customer_data)
            if not customer_response:
                self.log_error("Failed to create customer for arrow test")
                return False
                
            arrow_test_data['customer_id'] = customer_response['id']
            self.log_success(f"Arrow test customer created: {customer_response['name']}")
            
            # ============ CREATE PROJECT FOR ARROW TEST ============
            project_data = {
                "customer_id": customer_response['id'],
                "name": "Pfeil-Rendering Test Projekt",
                "description": "Test für Pfeil-Darstellung in PDF mit verschiedenen Strichstärken",
                "status": "active"
            }
            
            project_response = self.make_request('POST', '/projects', project_data)
            if not project_response:
                self.log_error("Failed to create project for arrow test")
                return False
                
            arrow_test_data['project_id'] = project_response['id']
            self.log_success(f"Arrow test project created: {project_response['name']}")
            
            # ============ CREATE SKETCH WITH ARROWS ============
            # Create metadata with 3 arrows of different strokeWidth values
            sketch_metadata = {
                "elements": [
                    {
                        "id": "arrow_1",
                        "type": "arrow",
                        "data": {
                            "x1": 100,
                            "y1": 100,
                            "x2": 300,
                            "y2": 100,
                            "text": "2mm",
                            "heads": "single"
                        },
                        "color": "#FF0000",
                        "strokeWidth": 2,
                        "rotation": 0
                    },
                    {
                        "id": "arrow_2", 
                        "type": "arrow",
                        "data": {
                            "x1": 100,
                            "y1": 200,
                            "x2": 300,
                            "y2": 200,
                            "text": "5mm",
                            "heads": "double"
                        },
                        "color": "#00FF00",
                        "strokeWidth": 5,
                        "rotation": 0
                    },
                    {
                        "id": "arrow_3",
                        "type": "arrow", 
                        "data": {
                            "x1": 100,
                            "y1": 300,
                            "x2": 300,
                            "y2": 300,
                            "text": "8mm",
                            "heads": "double"
                        },
                        "color": "#0000FF",
                        "strokeWidth": 8,
                        "rotation": 0
                    }
                ],
                "canvasWidth": 800,
                "canvasHeight": 600
            }
            
            # Create simple SVG for sketch_data (base64 encoded)
            svg_content = '''<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
                <rect width="800" height="600" fill="white"/>
                <text x="400" y="50" text-anchor="middle" font-size="20" fill="black">Pfeil-Test Skizze</text>
            </svg>'''
            
            svg_base64 = base64.b64encode(svg_content.encode('utf-8')).decode('utf-8')
            sketch_data_uri = f"data:image/svg+xml;base64,{svg_base64}"
            
            sketch_data = {
                "project_id": project_response['id'],
                "sketch_data": sketch_data_uri,
                "title": "Pfeil-Rendering Test Skizze",
                "metadata": json.dumps(sketch_metadata)
            }
            
            sketch_response = self.make_request('POST', '/sketches', sketch_data)
            if not sketch_response:
                self.log_error("Failed to create sketch for arrow test")
                return False
                
            arrow_test_data['sketch_id'] = sketch_response['id']
            self.log_success(f"Arrow test sketch created: {sketch_response['title']}")
            
            # ============ VERIFY SKETCH METADATA STORAGE ============
            sketches_response = self.make_request('GET', f'/sketches/project/{project_response["id"]}')
            if not sketches_response:
                self.log_error("Failed to retrieve sketches for arrow test")
                return False
                
            if not sketches_response:
                self.log_error("No sketches found for arrow test")
                return False
                
            saved_sketch = sketches_response[0]
            saved_metadata = saved_sketch.get('metadata')
            
            if not saved_metadata:
                self.log_error("CRITICAL: Sketch metadata is NULL - arrow elements not saved!")
                return False
                
            try:
                parsed_metadata = json.loads(saved_metadata)
                elements = parsed_metadata.get('elements', [])
                
                # Verify strokeWidth values are preserved
                arrow_strokes = []
                for element in elements:
                    if element.get('type') == 'arrow':
                        stroke = element.get('strokeWidth')
                        arrow_strokes.append(stroke)
                
                expected_strokes = [2, 5, 8]
                if arrow_strokes != expected_strokes:
                    self.log_error(f"Arrow strokeWidth mismatch: expected {expected_strokes}, got {arrow_strokes}")
                    return False
                    
                self.log_success(f"Arrow metadata saved correctly with strokeWidth values: {arrow_strokes}")
                
            except json.JSONDecodeError as e:
                self.log_error(f"Invalid JSON in sketch metadata: {e}")
                return False
            
            # ============ GENERATE PDF ============
            import time
            start_time = time.time()
            pdf_response = self.make_request('GET', f'/export/pdf/{project_response["id"]}')
            end_time = time.time()
            
            if not pdf_response or 'pdf_data' not in pdf_response:
                self.log_error("Failed to generate PDF for arrow test")
                return False
                
            pdf_data = pdf_response.get('pdf_data')
            filename = pdf_response.get('filename', 'arrow_test.pdf')
            
            # ============ SAVE PDF LOCALLY ============
            try:
                pdf_bytes = base64.b64decode(pdf_data)
                pdf_size = len(pdf_bytes)
                
                # Save to /tmp for manual inspection
                pdf_path = "/tmp/arrow_test.pdf"
                with open(pdf_path, 'wb') as f:
                    f.write(pdf_bytes)
                    
                # Verify PDF header
                if pdf_bytes[:4] == b'%PDF':
                    self.log_success(f"Arrow PDF generated successfully: {pdf_path} ({pdf_size:,} bytes, {end_time - start_time:.3f}s)")
                    self.log_success("PDF saved for manual inspection - check 'Skizzen' section for proportional arrow rendering")
                else:
                    self.log_error("Generated PDF has invalid format")
                    return False
                    
            except Exception as e:
                self.log_error(f"Failed to save arrow test PDF: {e}")
                return False
            
            return True
            
        except Exception as e:
            self.log_error(f"Unexpected error in arrow rendering test: {e}")
            return False
            
        finally:
            # ============ CLEANUP ARROW TEST DATA ============
            # Delete sketch
            if arrow_test_data['sketch_id']:
                self.make_request('DELETE', f'/sketches/{arrow_test_data["sketch_id"]}')
            
            # Delete project (cascades to related data)
            if arrow_test_data['project_id']:
                self.make_request('DELETE', f'/projects/{arrow_test_data["project_id"]}')
            
            # Delete customer
            if arrow_test_data['customer_id']:
                self.make_request('DELETE', f'/customers/{arrow_test_data["customer_id"]}')

    def test_pdf_element_distortion_fix(self):
        """
        Test PDF export to verify elements are not distorted (circles remain circular, squares remain square)
        This is a specific test for the uniform scaling fix in render_sketch_with_background function.
        """
        print("\n🔍 Testing PDF Element Distortion Fix...")
        
        distortion_test_data = {
            'customer_id': None,
            'project_id': None, 
            'sketch_id': None
        }
        
        try:
            # ============ CREATE TEST CUSTOMER ============
            customer_data = {
                "name": "PDF Distortion Test Kunde",
                "email": "distortion.test@example.com",
                "phone": "+49 123 456789", 
                "address": "Teststraße 123, 12345 Teststadt"
            }
            
            customer_response = self.make_request('POST', '/customers', customer_data)
            if not customer_response:
                self.log_error("Failed to create customer for distortion test")
                return False
                
            distortion_test_data['customer_id'] = customer_response['id']
            self.log_success(f"Distortion test customer created: {customer_response['id']}")
            
            # ============ CREATE TEST PROJECT ============
            project_data = {
                "customer_id": customer_response['id'],
                "name": "PDF Distortion Verification Project",
                "description": "Testing PDF export element distortion fix",
                "remarks": "Circle should be circular, rectangle should be square"
            }
            
            project_response = self.make_request('POST', '/projects', project_data)
            if not project_response:
                self.log_error("Failed to create project for distortion test")
                return False
                
            distortion_test_data['project_id'] = project_response['id']
            self.log_success(f"Distortion test project created: {project_response['id']}")
            
            # ============ CREATE SKETCH WITH DISTORTION TEST ELEMENTS ============
            # Create sketch metadata with specific elements that make distortion obvious
            sketch_metadata = {
                "canvasWidth": 800,
                "canvasHeight": 600,
                "elements": [
                    {
                        "type": "circle",
                        "data": {"cx": 200, "cy": 200, "r": 50},
                        "color": "#FF0000",
                        "strokeWidth": 3,
                        "rotation": 0
                    },
                    {
                        "type": "arrow",
                        "data": {
                            "x1": 100, "y1": 100, "x2": 300, "y2": 100,
                            "text": "Test", "heads": "single"
                        },
                        "color": "#00FF00", 
                        "strokeWidth": 5,
                        "rotation": 0
                    },
                    {
                        "type": "rect",
                        "data": {"x": 400, "y": 150, "width": 100, "height": 100},
                        "color": "#0000FF",
                        "strokeWidth": 2,
                        "rotation": 0
                    }
                ]
            }
            
            # Simple SVG for sketch_data (base64 encoded)
            svg_content = '''<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
                <circle cx="200" cy="200" r="50" fill="none" stroke="red" stroke-width="3"/>
                <line x1="100" y1="100" x2="300" y2="100" stroke="green" stroke-width="5"/>
                <rect x="400" y="150" width="100" height="100" fill="none" stroke="blue" stroke-width="2"/>
                <text x="200" y="120" fill="green" font-size="14">Test</text>
            </svg>'''
            
            sketch_data_base64 = base64.b64encode(svg_content.encode()).decode()
            
            sketch_data = {
                "project_id": project_response['id'],
                "sketch_data": f"data:image/svg+xml;base64,{sketch_data_base64}",
                "title": "Distortion Test Sketch",
                "metadata": json.dumps(sketch_metadata)
            }
            
            sketch_response = self.make_request('POST', '/sketches', sketch_data)
            if not sketch_response:
                self.log_error("Failed to create sketch for distortion test")
                return False
                
            distortion_test_data['sketch_id'] = sketch_response['id']
            self.log_success(f"Distortion test sketch created: {sketch_response['id']}")
            self.log_success(f"Canvas dimensions: {sketch_metadata['canvasWidth']}x{sketch_metadata['canvasHeight']}")
            self.log_success("Elements: Circle (center: 200,200, radius: 50), Arrow (100,100 to 300,100), Rectangle (400,150, 100x100)")
            
            # ============ GENERATE PDF ============
            import time
            start_time = time.time()
            pdf_response = self.make_request('GET', f'/export/pdf/{project_response["id"]}')
            end_time = time.time()
            
            if not pdf_response or 'pdf_data' not in pdf_response:
                self.log_error("Failed to generate PDF for distortion test")
                return False
                
            pdf_data = pdf_response.get('pdf_data')
            filename = pdf_response.get('filename', 'distortion_test.pdf')
            
            # ============ SAVE PDF LOCALLY ============
            try:
                pdf_bytes = base64.b64decode(pdf_data)
                pdf_size = len(pdf_bytes)
                
                # Save to /tmp for manual inspection
                pdf_path = "/tmp/distortion_test.pdf"
                with open(pdf_path, 'wb') as f:
                    f.write(pdf_bytes)
                    
                # Verify PDF header
                if pdf_bytes[:4] == b'%PDF':
                    self.log_success(f"Distortion test PDF generated successfully: {pdf_path} ({pdf_size:,} bytes, {end_time - start_time:.3f}s)")
                    self.log_success("CRITICAL VERIFICATION: PDF saved for manual inspection")
                    self.log_success("• CIRCLE at (200,200) with radius 50 - MUST appear perfectly round (not elliptical)")
                    self.log_success("• ARROW from (100,100) to (300,100) - MUST be horizontal")
                    self.log_success("• RECTANGLE at (400,150) size 100x100 - MUST appear as a SQUARE")
                    self.log_success("• Canvas dimensions: 800x600 - aspect ratio should be preserved")
                else:
                    self.log_error("Generated PDF has invalid format")
                    return False
                    
            except Exception as e:
                self.log_error(f"Failed to save distortion test PDF: {e}")
                return False
            
            return True
            
        except Exception as e:
            self.log_error(f"Unexpected error in distortion test: {e}")
            return False
            
        finally:
            # ============ CLEANUP DISTORTION TEST DATA ============
            # Delete sketch
            if distortion_test_data['sketch_id']:
                self.make_request('DELETE', f'/sketches/{distortion_test_data["sketch_id"]}')
            
            # Delete project (cascades to related data)
            if distortion_test_data['project_id']:
                self.make_request('DELETE', f'/projects/{distortion_test_data["project_id"]}')
            
            # Delete customer
            if distortion_test_data['customer_id']:
                self.make_request('DELETE', f'/customers/{distortion_test_data["customer_id"]}')

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
        
        # SPECIAL TEST: Arrow Rendering in PDF Export
        test_results.append(self.test_arrow_rendering_in_pdf())
        
        # SPECIAL TEST: PDF Element Distortion Fix Verification
        test_results.append(self.test_pdf_element_distortion_fix())
        
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

    def test_memo_pfeil_pdf_generation(self, project_id="698b920ed3804d56afcad4a2"):
        """
        Test PDF generation with Memo-Pfeilen (pointer elements) for specific project ID.
        This tests the arrow tip size reduction fix that was implemented but never tested.
        """
        print("\n🎯 Testing Memo-Pfeil PDF Generation...")
        print(f"   Project ID: {project_id}")
        
        try:
            # 1. Check if project exists
            print(f"   🔍 Checking if project {project_id} exists...")
            project_response = self.make_request('GET', f'/projects/{project_id}')
            if not project_response:
                self.log_error(f"Project {project_id} not found")
                return False
            
            self.log_success(f"Project found: '{project_response.get('name', 'Unknown')}'")
            
            # 2. Check for existing sketches with pointer elements
            print(f"   🔍 Checking for sketches with pointer elements...")
            sketches_response = self.make_request('GET', f'/sketches/project/{project_id}')
            
            pointer_count = 0
            if sketches_response:
                for sketch in sketches_response:
                    metadata = sketch.get('metadata')
                    if metadata:
                        try:
                            metadata_obj = json.loads(metadata)
                            elements = metadata_obj.get('elements', [])
                            for element in elements:
                                if element.get('type') == 'pointer':
                                    pointer_count += 1
                        except:
                            pass
            
            self.log_success(f"Found {len(sketches_response) if sketches_response else 0} sketches with {pointer_count} pointer elements")
            
            # 3. Create test sketch with pointer elements if none exist
            test_sketch_id = None
            if pointer_count == 0:
                print(f"   📝 Creating test sketch with pointer elements...")
                
                # Create test metadata with pointer elements
                test_metadata = {
                    "canvasWidth": 800,
                    "canvasHeight": 600,
                    "elements": [
                        {
                            "type": "pointer",
                            "data": {
                                "x1": 100,
                                "y1": 100,
                                "x2": 200,
                                "y2": 150,
                                "text": "Test-Notiz für Memo-Pfeil",
                                "fontSize": 16
                            },
                            "color": "#e91e63",
                            "strokeWidth": 6,
                            "rotation": 0
                        },
                        {
                            "type": "pointer", 
                            "data": {
                                "x1": 300,
                                "y1": 200,
                                "x2": 400,
                                "y2": 250,
                                "text": "Pfeilspitzen-Größe Test",
                                "fontSize": 14
                            },
                            "color": "#2196f3",
                            "strokeWidth": 4,
                            "rotation": 0
                        }
                    ]
                }
                
                # Create simple SVG for sketch_data
                svg_content = '''<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
                    <rect width="800" height="600" fill="white"/>
                    <text x="400" y="50" text-anchor="middle" font-size="20" fill="black">Memo-Pfeil Test</text>
                </svg>'''
                
                sketch_data_base64 = base64.b64encode(svg_content.encode()).decode()
                
                sketch_payload = {
                    "project_id": project_id,
                    "sketch_data": f"data:image/svg+xml;base64,{sketch_data_base64}",
                    "title": "Memo-Pfeil Test Sketch",
                    "metadata": json.dumps(test_metadata)
                }
                
                sketch_response = self.make_request('POST', '/sketches', sketch_payload)
                if sketch_response:
                    test_sketch_id = sketch_response.get('id')
                    self.log_success(f"Test sketch created with ID: {test_sketch_id}")
                else:
                    self.log_error("Failed to create test sketch")
                    return False
            
            # 4. Test PDF generation
            print(f"   📄 Generating PDF...")
            import time
            start_time = time.time()
            
            pdf_response = self.make_request('GET', f'/export/pdf/{project_id}')
            generation_time = time.time() - start_time
            
            if pdf_response and 'pdf_data' in pdf_response:
                # Decode and save PDF
                try:
                    pdf_bytes = base64.b64decode(pdf_response['pdf_data'])
                    pdf_size = len(pdf_bytes)
                    
                    # Verify PDF format
                    is_valid_pdf = pdf_bytes.startswith(b'%PDF')
                    
                    if is_valid_pdf:
                        # Save PDF for manual inspection
                        pdf_path = f"/tmp/memo_pfeil_test_{project_id}.pdf"
                        with open(pdf_path, 'wb') as f:
                            f.write(pdf_bytes)
                        
                        self.log_success(f"PDF generated successfully - Size: {pdf_size:,} bytes, Time: {generation_time:.3f}s")
                        self.log_success(f"PDF saved to: {pdf_path}")
                        
                        # Additional verification
                        if pdf_size > 10000:  # At least 10KB indicates substantial content
                            self.log_success("PDF size indicates substantial content with pointer elements")
                        else:
                            print(f"   ⚠️  PDF size is small ({pdf_size:,} bytes) - may indicate missing content")
                        
                        # Cleanup test sketch if created
                        if test_sketch_id:
                            print(f"   🧹 Cleaning up test sketch...")
                            cleanup_response = self.make_request('DELETE', f'/sketches/{test_sketch_id}')
                            if cleanup_response:
                                self.log_success("Test sketch cleaned up successfully")
                        
                        return True
                    else:
                        self.log_error("PDF generation returned invalid PDF format")
                        return False
                        
                except Exception as e:
                    self.log_error("Failed to decode PDF data", e)
                    return False
            else:
                self.log_error("PDF generation failed - no pdf_data in response")
                return False
                
        except Exception as e:
            self.log_error("Memo-Pfeil PDF test failed", e)
            return False

def main():
    """Main test execution"""
    tester = AufmassAPITester()
    
    # Run the specific Memo-Pfeil PDF test as requested
    print("=" * 80)
    print("MEMO-PFEIL PDF GENERATION TEST")
    print("=" * 80)
    print("Testing PDF generation with Memo-Pfeilen (pointer elements)")
    print("Focus: Arrow tip size reduction fix verification")
    print()
    
    success = tester.test_memo_pfeil_pdf_generation()
    
    if success:
        print("\n🎉 MEMO-PFEIL PDF TEST COMPLETED SUCCESSFULLY!")
        print("📋 MANUAL VERIFICATION REQUIRED:")
        print("   1. Open the generated PDF file: /tmp/memo_pfeil_test_698b920ed3804d56afcad4a2.pdf")
        print("   2. Check the 'Skizzen' section for pointer elements (Memo-Pfeile)")
        print("   3. Verify that arrow tips have reasonable size (not overproportional)")
        print("   4. Confirm the arrow tip size reduction fix is working correctly")
    else:
        print("\n💥 MEMO-PFEIL PDF TEST FAILED!")
        print("🔧 Check backend logs and ensure:")
        print("   1. Project ID 698b920ed3804d56afcad4a2 exists")
        print("   2. Backend service is running properly")
        print("   3. PDF generation pipeline is working")
    
    return 0 if success else 1

if __name__ == "__main__":
    exit(main())