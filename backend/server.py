from fastapi import FastAPI, APIRouter, HTTPException, File, UploadFile
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from bson import ObjectId
import base64
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
import math
from PIL import Image as PILImage, ImageDraw
import json
import cairosvg

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Helper function to convert ObjectId to string
def serialize_doc(doc):
    if doc and "_id" in doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    return doc

# Models
class Customer(BaseModel):
    id: Optional[str] = None
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class RoofMeasurement(BaseModel):
    id: Optional[str] = None
    project_id: str
    roof_type: str  # Satteldach, Walmdach, Flachdach, Pultdach
    measurements: Dict[str, float]  # Dynamic measurements based on roof type
    area: float  # Calculated area in m²
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Photo(BaseModel):
    id: Optional[str] = None
    project_id: str
    image_data: str  # base64
    annotations: Optional[str] = None  # JSON string of annotations
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Sketch(BaseModel):
    id: Optional[str] = None
    project_id: str
    sketch_data: str  # base64 image
    title: Optional[str] = None
    metadata: Optional[str] = None  # JSON string of sketch elements and settings
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ChecklistTemplate(BaseModel):
    id: Optional[str] = None
    name: str
    items: List[str]
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ChecklistInstance(BaseModel):
    id: Optional[str] = None
    project_id: str
    template_id: str
    template_name: str
    items: List[Dict[str, Any]]  # [{"text": str, "checked": bool}]
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Project(BaseModel):
    id: Optional[str] = None
    customer_id: str
    name: str
    description: Optional[str] = None
    status: str = "active"  # active, completed, archived
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# Customer endpoints
@api_router.post("/customers", response_model=Customer)
async def create_customer(customer: Customer):
    customer_dict = customer.dict(exclude={'id'})
    result = await db.customers.insert_one(customer_dict)
    customer_dict['id'] = str(result.inserted_id)
    return Customer(**customer_dict)

@api_router.get("/customers", response_model=List[Customer])
async def get_customers():
    customers = await db.customers.find().to_list(1000)
    return [Customer(**serialize_doc(c)) for c in customers]

@api_router.get("/customers/{customer_id}", response_model=Customer)
async def get_customer(customer_id: str):
    customer = await db.customers.find_one({"_id": ObjectId(customer_id)})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return Customer(**serialize_doc(customer))

@api_router.put("/customers/{customer_id}", response_model=Customer)
async def update_customer(customer_id: str, customer: Customer):
    customer_dict = customer.dict(exclude={'id', 'created_at'})
    result = await db.customers.update_one(
        {"_id": ObjectId(customer_id)},
        {"$set": customer_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    updated_customer = await db.customers.find_one({"_id": ObjectId(customer_id)})
    return Customer(**serialize_doc(updated_customer))

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str):
    result = await db.customers.delete_one({"_id": ObjectId(customer_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"message": "Customer deleted"}

# Project endpoints
@api_router.post("/projects", response_model=Project)
async def create_project(project: Project):
    project_dict = project.dict(exclude={'id'})
    result = await db.projects.insert_one(project_dict)
    project_dict['id'] = str(result.inserted_id)
    return Project(**project_dict)

@api_router.get("/projects", response_model=List[Project])
async def get_projects():
    projects = await db.projects.find().sort("created_at", -1).to_list(1000)
    return [Project(**serialize_doc(p)) for p in projects]

@api_router.get("/projects/{project_id}", response_model=Project)
async def get_project(project_id: str):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return Project(**serialize_doc(project))

@api_router.put("/projects/{project_id}", response_model=Project)
async def update_project(project_id: str, project: Project):
    project_dict = project.dict(exclude={'id', 'created_at'})
    project_dict['updated_at'] = datetime.utcnow()
    result = await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": project_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    updated_project = await db.projects.find_one({"_id": ObjectId(project_id)})
    return Project(**serialize_doc(updated_project))

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    # Also delete related data
    await db.roofs.delete_many({"project_id": project_id})
    await db.photos.delete_many({"project_id": project_id})
    await db.sketches.delete_many({"project_id": project_id})
    await db.checklists.delete_many({"project_id": project_id})
    
    result = await db.projects.delete_one({"_id": ObjectId(project_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"message": "Project deleted"}

# Roof measurements
@api_router.post("/roofs", response_model=RoofMeasurement)
async def create_roof(roof: RoofMeasurement):
    roof_dict = roof.dict(exclude={'id'})
    result = await db.roofs.insert_one(roof_dict)
    roof_dict['id'] = str(result.inserted_id)
    return RoofMeasurement(**roof_dict)

@api_router.get("/roofs/project/{project_id}", response_model=List[RoofMeasurement])
async def get_project_roofs(project_id: str):
    roofs = await db.roofs.find({"project_id": project_id}).to_list(1000)
    return [RoofMeasurement(**serialize_doc(r)) for r in roofs]

@api_router.put("/roofs/{roof_id}", response_model=RoofMeasurement)
async def update_roof(roof_id: str, roof: RoofMeasurement):
    roof_dict = roof.dict(exclude={'id', 'created_at'})
    result = await db.roofs.update_one(
        {"_id": ObjectId(roof_id)},
        {"$set": roof_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Roof not found")
    updated_roof = await db.roofs.find_one({"_id": ObjectId(roof_id)})
    return RoofMeasurement(**serialize_doc(updated_roof))

@api_router.delete("/roofs/{roof_id}")
async def delete_roof(roof_id: str):
    result = await db.roofs.delete_one({"_id": ObjectId(roof_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Roof not found")
    return {"message": "Roof deleted"}

# Photos
@api_router.post("/photos", response_model=Photo)
async def create_photo(photo: Photo):
    photo_dict = photo.dict(exclude={'id'})
    result = await db.photos.insert_one(photo_dict)
    photo_dict['id'] = str(result.inserted_id)
    return Photo(**photo_dict)

@api_router.get("/photos/project/{project_id}", response_model=List[Photo])
async def get_project_photos(project_id: str):
    photos = await db.photos.find({"project_id": project_id}).to_list(1000)
    return [Photo(**serialize_doc(p)) for p in photos]

@api_router.put("/photos/{photo_id}", response_model=Photo)
async def update_photo(photo_id: str, photo: Photo):
    photo_dict = photo.dict(exclude={'id'})
    result = await db.photos.update_one(
        {"_id": ObjectId(photo_id)},
        {"$set": photo_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Photo not found")
    photo_dict['id'] = photo_id
    return Photo(**photo_dict)

@api_router.delete("/photos/{photo_id}")
async def delete_photo(photo_id: str):
    result = await db.photos.delete_one({"_id": ObjectId(photo_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Photo not found")
    return {"message": "Photo deleted"}

# Sketches
@api_router.post("/sketches", response_model=Sketch)
async def create_sketch(sketch: Sketch):
    sketch_dict = sketch.dict(exclude={'id'})
    result = await db.sketches.insert_one(sketch_dict)
    sketch_dict['id'] = str(result.inserted_id)
    return Sketch(**sketch_dict)

@api_router.get("/sketches/project/{project_id}", response_model=List[Sketch])
async def get_project_sketches(project_id: str):
    sketches = await db.sketches.find({"project_id": project_id}).to_list(1000)
    return [Sketch(**serialize_doc(s)) for s in sketches]

@api_router.put("/sketches/{sketch_id}", response_model=Sketch)
async def update_sketch(sketch_id: str, sketch: Sketch):
    sketch_dict = sketch.dict(exclude={'id'})
    result = await db.sketches.update_one(
        {"_id": ObjectId(sketch_id)},
        {"$set": sketch_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Sketch not found")
    sketch_dict['id'] = sketch_id
    return Sketch(**sketch_dict)

@api_router.delete("/sketches/{sketch_id}")
async def delete_sketch(sketch_id: str):
    result = await db.sketches.delete_one({"_id": ObjectId(sketch_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sketch not found")
    return {"message": "Sketch deleted"}

# Checklist Templates
@api_router.post("/checklist-templates", response_model=ChecklistTemplate)
async def create_checklist_template(template: ChecklistTemplate):
    template_dict = template.dict(exclude={'id'})
    result = await db.checklist_templates.insert_one(template_dict)
    template_dict['id'] = str(result.inserted_id)
    return ChecklistTemplate(**template_dict)

@api_router.get("/checklist-templates", response_model=List[ChecklistTemplate])
async def get_checklist_templates():
    templates = await db.checklist_templates.find().to_list(1000)
    return [ChecklistTemplate(**serialize_doc(t)) for t in templates]

@api_router.delete("/checklist-templates/{template_id}")
async def delete_checklist_template(template_id: str):
    result = await db.checklist_templates.delete_one({"_id": ObjectId(template_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}

# Checklists
@api_router.post("/checklists", response_model=ChecklistInstance)
async def create_checklist(checklist: ChecklistInstance):
    checklist_dict = checklist.dict(exclude={'id'})
    result = await db.checklists.insert_one(checklist_dict)
    checklist_dict['id'] = str(result.inserted_id)
    return ChecklistInstance(**checklist_dict)

@api_router.get("/checklists/project/{project_id}", response_model=List[ChecklistInstance])
async def get_project_checklists(project_id: str):
    checklists = await db.checklists.find({"project_id": project_id}).to_list(1000)
    return [ChecklistInstance(**serialize_doc(c)) for c in checklists]

@api_router.put("/checklists/{checklist_id}", response_model=ChecklistInstance)
async def update_checklist(checklist_id: str, checklist: ChecklistInstance):
    checklist_dict = checklist.dict(exclude={'id', 'created_at'})
    result = await db.checklists.update_one(
        {"_id": ObjectId(checklist_id)},
        {"$set": checklist_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Checklist not found")
    updated_checklist = await db.checklists.find_one({"_id": ObjectId(checklist_id)})
    return ChecklistInstance(**serialize_doc(updated_checklist))

@api_router.delete("/checklists/{checklist_id}")
async def delete_checklist(checklist_id: str):
    result = await db.checklists.delete_one({"_id": ObjectId(checklist_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return {"message": "Checklist deleted"}

# PDF Export
@api_router.get("/export/pdf/{project_id}")
async def export_project_pdf(project_id: str):
    # Fetch project data
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    customer = await db.customers.find_one({"_id": ObjectId(project['customer_id'])})
    roofs = await db.roofs.find({"project_id": project_id}).to_list(1000)
    photos = await db.photos.find({"project_id": project_id}).to_list(1000)
    sketches = await db.sketches.find({"project_id": project_id}).to_list(1000)
    checklists = await db.checklists.find({"project_id": project_id}).to_list(1000)
    
    # Create PDF
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1976d2'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    elements.append(Paragraph(f"Dachflächen-Aufmaß: {project['name']}", title_style))
    elements.append(Spacer(1, 12))
    
    # Customer info
    if customer:
        elements.append(Paragraph("Kundendaten", styles['Heading2']))
        customer_data = [
            ['Name:', customer.get('name', '')],
            ['E-Mail:', customer.get('email', '')],
            ['Telefon:', customer.get('phone', '')],
            ['Adresse:', customer.get('address', '')]
        ]
        customer_table = Table(customer_data, colWidths=[80*mm, 110*mm])
        customer_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.grey),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        elements.append(customer_table)
        elements.append(Spacer(1, 20))
    
    # Roof measurements
    if roofs:
        elements.append(Paragraph("Dachmessungen", styles['Heading2']))
        for roof in roofs:
            elements.append(Paragraph(f"Dachtyp: {roof['roof_type']}", styles['Heading3']))
            elements.append(Paragraph(f"Fläche: {roof['area']:.2f} m²", styles['Normal']))
            if roof.get('notes'):
                elements.append(Paragraph(f"Notizen: {roof['notes']}", styles['Normal']))
            elements.append(Spacer(1, 10))
    
    # Photos
    if photos:
        elements.append(PageBreak())
        elements.append(Paragraph("Fotos", styles['Heading2']))
        for i, photo in enumerate(photos):
            try:
                img_data = base64.b64decode(photo['image_data'].split(',')[1] if ',' in photo['image_data'] else photo['image_data'])
                img = RLImage(BytesIO(img_data), width=150*mm, height=100*mm)
                elements.append(img)
                if photo.get('description'):
                    elements.append(Paragraph(photo['description'], styles['Normal']))
                elements.append(Spacer(1, 10))
            except:
                pass
    
    # Sketches
    if sketches:
        elements.append(PageBreak())
        elements.append(Paragraph("Skizzen", styles['Heading2']))
        for sketch in sketches:
            try:
                if sketch.get('title'):
                    elements.append(Paragraph(sketch['title'], styles['Heading3']))
                img_data = base64.b64decode(sketch['sketch_data'].split(',')[1] if ',' in sketch['sketch_data'] else sketch['sketch_data'])
                img = RLImage(BytesIO(img_data), width=150*mm, height=100*mm)
                elements.append(img)
                elements.append(Spacer(1, 10))
            except:
                pass
    
    # Checklists
    if checklists:
        elements.append(PageBreak())
        elements.append(Paragraph("Checklisten", styles['Heading2']))
        for checklist in checklists:
            elements.append(Paragraph(checklist['template_name'], styles['Heading3']))
            for item in checklist['items']:
                status = '✓' if item['checked'] else '○'
                elements.append(Paragraph(f"{status} {item['text']}", styles['Normal']))
            elements.append(Spacer(1, 10))
    
    doc.build(elements)
    pdf_data = base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    return {
        "pdf_data": pdf_data,
        "filename": f"Aufmass_{project['name'].replace(' ', '_')}.pdf"
    }

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
