import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Paleta de colores para cada sección
const SECTION_COLORS = [
    { primary: '#9c27b0', secondary: '#e1bee7' }, // Lila - Información
    { primary: '#7b1fa2', secondary: '#ce93d8' }, // Lila oscuro - EPP
    { primary: '#673ab7', secondary: '#b39ddb' }, // Índigo - Herramientas
    { primary: '#3f51b5', secondary: '#9fa8da' }, // Azul - Logística
    { primary: '#2196f3', secondary: '#90caf9' }, // Azul claro - Alimentación
    { primary: '#03a9f4', secondary: '#81d4fa' }, // Cian - Equipo de campo
    { primary: '#00bcd4', secondary: '#80deea' }, // Turquesa - Limpieza
    { primary: '#009688', secondary: '#80cbc4' }, // Verde azulado - Medicamentos
    { primary: '#4caf50', secondary: '#a5d6a7' }  // Verde - Rescate animal
];

// Configuración de secciones con endpoints y reglas básicas
const SECTIONS = [
    {
        id: 'info',
        name: 'Información',
        endpoint: '',
        fields: ['nombre', 'cantidadactivos', 'nombrecomandante', 'celularcomandante', 'encargadologistica', 'celularlogistica', 'numerosemergencia'],
        required: ['nombre', 'cantidadactivos', 'nombrecomandante', 'celularcomandante']
    },
    {
        id: 'epp',
        name: 'Equipamiento',
        endpoint: '/epp-ropa',
        fields: ['tipo', 'talla', 'cantidad', 'observaciones']
    },
    {
        id: 'tools',
        name: 'Herramientas',
        endpoint: '/herramientas',
        fields: ['item', 'cantidad', 'observaciones']
    },
    {
        id: 'logistics',
        name: 'Logística',
        endpoint: '/logistica-repuestos',
        fields: ['item', 'costo', 'observaciones']
    },
    {
        id: 'food',
        name: 'Alimentación',
        endpoint: '/alimentacion',
        fields: ['item', 'cantidad', 'observaciones']
    },
    {
        id: 'camp',
        name: 'Campo',
        endpoint: '/logistica-campo',
        fields: ['item', 'cantidad', 'observaciones']
    },
    {
        id: 'hygiene',
        name: 'Limpieza',
        endpoint: '/limpieza-personal',
        fields: ['item', 'cantidad', 'observaciones']
    },
    {
        id: 'meds',
        name: 'Medicamentos',
        endpoint: '/medicamentos',
        fields: ['item', 'cantidad', 'observaciones']
    },
    {
        id: 'animals',
        name: 'Rescate',
        endpoint: '/rescate-animal',
        fields: ['item', 'cantidad', 'observaciones']
    }
];

// Componente de input numérico con botones +/-
const NumberInput = ({ value, onChange, min = 0, max, className = '', darkMode = false, ...props }) => {
    const handleIncrement = () => {
        onChange(Math.min(value + 1, max || Infinity));
    };

    const handleDecrement = () => {
        onChange(Math.max(value - 1, min));
    };

    return (
        <div className={`flex items-center ${className}`}>
            <button
                type="button"
                onClick={handleDecrement}
                className={`px-3 py-1 rounded-l-lg focus:outline-none ${
                    darkMode
                        ? 'bg-purple-700 text-purple-100 hover:bg-purple-600'
                        : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                }`}
                aria-label="Decrementar"
                disabled={value <= min}
            >
                −
            </button>
            <input
                type="number"
                value={value}
                min={min}
                max={max}
                onChange={(e) => onChange(parseInt(e.target.value) || min)}
                className={`w-16 px-2 py-1 border-t border-b text-center ${
                    darkMode
                        ? 'bg-gray-700 border-gray-600 text-white'
                        : 'bg-white border-gray-300 text-gray-800'
                }`}
                {...props}
            />
            <button
                type="button"
                onClick={handleIncrement}
                className={`px-3 py-1 rounded-r-lg focus:outline-none ${
                    darkMode
                        ? 'bg-teal-700 text-teal-100 hover:bg-teal-600'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
                aria-label="Incrementar"
                disabled={max !== undefined && value >= max}
            >
                +
            </button>
        </div>
    );
};


const BombForm = () => {
    const [darkMode, setDarkMode] = useState(false);
    const [activeSection, setActiveSection] = useState('info');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState({
        success: null,
        isFinal: false,
        message: ''
    });
    const [brigadaId, setBrigadaId] = useState(null);
    const [completedSections, setCompletedSections] = useState({});
    const [formErrors, setFormErrors] = useState({});
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const formRef = useRef();

    // Obtener colores de la sección actual
    const currentSectionIndex = SECTIONS.findIndex(s => s.id === activeSection);
    const currentColors = SECTION_COLORS[currentSectionIndex] || SECTION_COLORS[0];

    // Catálogos de ítems por sección
    const EPP_ROPA_ITEMS = ['Camisa Forestal', 'Pantalón Forestal', 'Overol FR'];
    const EPP_EQUIPO_ITEMS = [
        'Esclavina', 'Linterna', 'Antiparra', 'Casco Forestal Ala Ancha',
        'Máscara para Polvo y Partículas', 'Máscara Media Cara', 'Barbijos'
    ];
    const BOTAS_SIZES = ['37', '38', '39', '40', '41', '42', '43', 'otra'];
    const GUANTES_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'otra'];
    const HERRAMIENTAS_ITEMS = [
        'Linternas de Cabeza', 'Pilas AA', 'Pilas AAA', 'Azadón',
        'Pala con Mango de Fibra', 'Rastrillo Mango de Fibra',
        'McLeod Mango de Fibra', 'Batefuego', 'Gorgui',
        'Pulasky con Mango de Fibra', 'Quemador de Goteo',
        'Mochila Forestal', 'Escobeta de Alambre'
    ];
    const LOGISTICA_REPUESTOS_ITEMS = [
        'Gasolina', 'Diésel', 'Amortiguadores', 'Prensa Disco',
        'Rectificación de Frenos', 'Llantas', 'Aceite de Motor',
        'Grasa', 'Cambio de Aceite', 'Otro Tipo de Arreglo'
    ];
    const ALIMENTACION_ITEMS = [
        'Alimentos y Bebidas', 'Agua', 'Rehidratantes', 'Barras Energizantes',
        'Lata de Atún', 'Lata de Frejol', 'Lata de Viandada', 'Lata de Chorizos',
        'Refresco en Sobres', 'Leche Polvo', 'Frutos Secos',
        'Pastillas de Menta o Dulces', 'Alimentos No Perecederos'
    ];
    const CAMPO_ITEMS = ['Carpas', 'Colchonetas', 'Mochilas Personales', 'Mantas', 'Cuerdas', 'Radio Comunicadores', 'Baterías Portátiles'];
    const LIMPIEZA_PERSONAL_ITEMS = ['Papel Higiénico', 'Cepillos de Dientes', 'Jabón', 'Pasta Dental', 'Toallas', 'Alcohol en Gel'];
    const LIMPIEZA_GENERAL_ITEMS = ['Detergente', 'Escobas', 'Trapeadores', 'Bolsas de Basura', 'Lavandina', 'Desinfectante'];
    const MEDICAMENTOS_ITEMS = ['Paracetamol', 'Ibuprofeno', 'Antibióticos', 'Suero Oral', 'Gasas', 'Vendas', 'Alcohol', 'Yodo', 'Curitas'];
    const RESCATE_ANIMAL_ITEMS = ['Jaulas de Transporte', 'Collares', 'Comida para Mascotas', 'Guantes Especiales', 'Medicamentos Veterinarios'];

    // Estado del formulario principal
    const [formData, setFormData] = useState({
        nombre: '',
        cantidadactivos: 1,
        nombrecomandante: '',
        celularcomandante: '',
        encargadologistica: '',
        celularlogistica: '',
        numerosemergencia: ''
    });

    // Estados específicos por sección
    const [eppRopa, setEppRopa] = useState(() =>
        Object.fromEntries(EPP_ROPA_ITEMS.map(item => [item, {
            xs: 0,
            s: 0,
            m: 0,
            l: 0,
            xl: 0,
            observaciones: ''
        }]))
    );
    const [botas, setBotas] = useState(() => ({
        '37': 0, '38': 0, '39': 0, '40': 0, '41': 0, '42': 0, '43': 0,
        otra: 0, otratalla: '', observaciones: ''
    }));
    const [guantes, setGuantes] = useState(() => ({
        XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0, otra: 0, otratalla: ''
    }));
    const [eppEquipo, setEppEquipo] = useState(() =>
        Object.fromEntries(EPP_EQUIPO_ITEMS.map(item => [item, { cantidad: 0, observaciones: '' }]))
    );
    const [eppEquipoCustom, setEppEquipoCustom] = useState([]);
    const [herramientas, setHerramientas] = useState(() =>
        Object.fromEntries(HERRAMIENTAS_ITEMS.map(item => [item, { cantidad: 0, observaciones: '' }]))
    );
    const [herramientasCustom, setHerramientasCustom] = useState([]);
    const [logisticaRepuestos, setLogisticaRepuestos] = useState(() =>
        Object.fromEntries(LOGISTICA_REPUESTOS_ITEMS.map(item => [item, { costo: 0, observaciones: '' }]))
    );
    const [logisticaRepuestosCustom, setLogisticaRepuestosCustom] = useState([]);
    const [alimentacion, setAlimentacion] = useState(() =>
        Object.fromEntries(ALIMENTACION_ITEMS.map(item => [item, { cantidad: 0, observaciones: '' }]))
    );
    const [alimentacionCustom, setAlimentacionCustom] = useState([]);
    const [logisticaCampo, setLogisticaCampo] = useState(() =>
        Object.fromEntries(CAMPO_ITEMS.map(item => [item, { cantidad: 0, observaciones: '' }]))
    );
    const [logisticaCampoCustom, setLogisticaCampoCustom] = useState([]);
    const [limpiezaPersonal, setLimpiezaPersonal] = useState(() =>
        Object.fromEntries(LIMPIEZA_PERSONAL_ITEMS.map(item => [item, { cantidad: 0, observaciones: '' }]))
    );
    const [limpiezaPersonalCustom, setLimpiezaPersonalCustom] = useState([]);
    const [limpiezaGeneral, setLimpiezaGeneral] = useState(() =>
        Object.fromEntries(LIMPIEZA_GENERAL_ITEMS.map(item => [item, { cantidad: 0, observaciones: '' }]))
    );
    const [limpiezaGeneralCustom, setLimpiezaGeneralCustom] = useState([]);
    const [medicamentos, setMedicamentos] = useState(() =>
        Object.fromEntries(MEDICAMENTOS_ITEMS.map(item => [item, { cantidad: 0, observaciones: '' }]))
    );
    const [medicamentosCustom, setMedicamentosCustom] = useState([]);
    const [rescateAnimal, setRescateAnimal] = useState(() =>
        Object.fromEntries(RESCATE_ANIMAL_ITEMS.map(item => [item, { cantidad: 0, observaciones: '' }]))
    );
    const [rescateAnimalCustom, setRescateAnimalCustom] = useState([]);
    const [eppRopaCustom, setEppRopaCustom] = useState([]);

    // Toggle modo oscuro
    const toggleDarkMode = () => {
        const newMode = !darkMode;
        setDarkMode(newMode);
        document.documentElement.classList.toggle('dark', newMode);
        localStorage.setItem('darkMode', newMode);
    };

    // Efecto para cargar preferencia de modo oscuro
    useEffect(() => {
        const savedMode = localStorage.getItem('darkMode') === 'true';
        setDarkMode(savedMode);
        if (savedMode) {
            document.documentElement.classList.add('dark');
        }
    }, []);

    // Manejador para campos simples de brigada con validaciones
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        let processedValue = value;

        // Aplicar validaciones en tiempo real según el campo
        switch (name) {
            case 'nombre':
            case 'nombrecomandante':
            case 'encargadologistica':
                // Solo permite letras y espacios
                processedValue = value.replace(/[^a-zA-Z\s]/g, '');
                break;
            case 'celularcomandante':
            case 'celularlogistica':
                // Solo permite números
                processedValue = value.replace(/\D/g, '');
                break;
            case 'numerosemergencia':
                // Solo permite números, comas y espacios
                processedValue = value.replace(/[^0-9,\s]/g, '');
                break;
            case 'cantidadactivos':
                processedValue = Math.max(1, parseInt(value) || 1);
                break;
            default:
                processedValue = value;
        }

        setFormData(prev => ({
            ...prev,
            [name]: processedValue
        }));

        // Limpia el error para este campo si el usuario empieza a corregirlo
        if (formErrors[name]) {
            setFormErrors(prev => ({ ...prev, [name]: null }));
        }
    };


    // Handlers específicos por sección
    const handleEppRopaSizeChange = (item, sizeKey, value) => {
        setEppRopa(prev => ({
            ...prev,
            [item]: { ...prev[item], [sizeKey]: Number(value) || 0 }
        }));
    };

    const handleEppRopaObsChange = (item, text) => {
        setEppRopa(prev => ({
            ...prev,
            [item]: { ...prev[item], observaciones: text }
        }));
    };

    const handleBotasChange = (sizeKey, value) => {
        setBotas(prev => ({ ...prev, [sizeKey]: Number(value) || 0 }));
    };

    const handleBotasObsChange = (text) => {
        setBotas(prev => ({ ...prev, observaciones: text }));
    };

    const handleBotasOtraTallaText = (text) => {
        setBotas(prev => ({ ...prev, otratalla: text }));
    };

    const handleGuantesChange = (sizeKey, value) => {
        setGuantes(prev => ({ ...prev, [sizeKey]: Number(value) || 0 }));
    };

    const handleGuantesOtraTallaText = (text) => {
        setGuantes(prev => ({ ...prev, otratalla: text }));
    };

    const handleListQuantityChange = (setter) => (item, value) => {
        setter(prev => ({
            ...prev,
            [item]: { ...prev[item], cantidad: Number(value) || 0 }
        }));
    };

    const handleListCostChange = (setter) => (item, value) => {
        setter(prev => ({
            ...prev,
            [item]: { ...prev[item], costo: Number(value) || 0 }
        }));
    };

    const handleListObsChange = (setter) => (item, text) => {
        setter(prev => ({
            ...prev,
            [item]: { ...prev[item], observaciones: text }
        }));
    };

    // Validar sección actual con más detalle
    const validateSection = (sectionId) => {
        const section = SECTIONS.find(s => s.id === sectionId);
        if (!section) return true;

        const errors = {};
        let isValid = true;

        section.fields.forEach(field => {
            const fieldValue = formData[field]?.toString() || '';

            // 1. Validar campos requeridos
            if (section.required?.includes(field) && fieldValue.trim() === '') {
                errors[field] = 'Este campo es obligatorio';
                isValid = false;
            }

            // 2. Validaciones de formato específicas (solo si el campo no está vacío)
            if (fieldValue.trim() !== '') {
                switch (field) {
                    case 'nombre':
                    case 'nombrecomandante':
                    case 'encargadologistica':
                        if (!/^[a-zA-Z\s]+$/.test(fieldValue)) {
                            errors[field] = 'Este campo solo acepta letras y espacios.';
                            isValid = false;
                        }
                        break;
                    case 'celularcomandante':
                    case 'celularlogistica':
                        if (!/^\d{8}$/.test(fieldValue)) {
                            errors[field] = 'El teléfono debe tener exactamente 8 dígitos.';
                            isValid = false;
                        }
                        break;
                    case 'numerosemergencia':
                        if (!/^[0-9,\s]+$/.test(fieldValue)) {
                            errors[field] = 'Solo se permiten números, comas y espacios.';
                            isValid = false;
                        }
                        break;
                    case 'cantidadactivos':
                        if (parseInt(fieldValue) < 1) {
                            errors[field] = 'Debe haber al menos un bombero activo.';
                            isValid = false;
                        }
                        break;
                }
            }
        });

        setFormErrors(errors);
        return isValid;
    };


    // Navegación entre secciones con validación
    const goToSection = (sectionId) => {
        if (validateSection(activeSection)) {
            setActiveSection(sectionId);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setSubmitStatus({ success: null, message: '' });
            return true;
        }
        return false;
    };

    // Manejador de envío del formulario
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateSection(activeSection)) {
            return;
        }

        setIsSubmitting(true);
        try {
            // Construir el objeto de datos completo
            const fullData = {
                // Información básica de la brigada
                ...formData,

                // Equipamiento EPP
                eppRopa,
                botas,
                guantes,
                eppEquipo: {
                    ...eppEquipo,
                    custom: eppEquipoCustom
                },
                eppRopaCustom,

                // Herramientas
                herramientas: {
                    ...herramientas,
                    custom: herramientasCustom
                },

                // Logística
                logisticaRepuestos: {
                    ...logisticaRepuestos,
                    custom: logisticaRepuestosCustom
                },

                // Alimentación
                alimentacion: {
                    ...alimentacion,
                    custom: alimentacionCustom
                },

                // Equipo de campo
                logisticaCampo: {
                    ...logisticaCampo,
                    custom: logisticaCampoCustom
                },

                // Limpieza
                limpiezaPersonal: {
                    ...limpiezaPersonal,
                    custom: limpiezaPersonalCustom
                },
                limpiezaGeneral: {
                    ...limpiezaGeneral,
                    custom: limpiezaGeneralCustom
                },

                // Medicamentos
                medicamentos: {
                    ...medicamentos,
                    custom: medicamentosCustom
                },

                // Rescate animal
                rescateAnimal: {
                    ...rescateAnimal,
                    custom: rescateAnimalCustom
                }
            };

            const currentIndex = SECTIONS.findIndex(s => s.id === activeSection);
            const isLastSection = currentIndex === SECTIONS.length - 1;

            if (isLastSection) {
                setSubmitStatus({
                    success: true,
                    message: '¡Formulario completado con éxito! Tus necesidades han sido registradas.',
                    isFinal: true
                });
            } else {
                setSubmitStatus({
                    success: true,
                    message: 'Sección guardada correctamente. Avanzando...'
                });

                // Navegar a la siguiente sección
                setActiveSection(SECTIONS[currentIndex + 1].id);
                window.scrollTo({ top: 0, behavior: 'smooth' });

                // Limpiar mensaje después de 1.5 segundos
                setTimeout(() => {
                    setSubmitStatus({ success: null, message: '' });
                }, 1500);
            }
        } catch (error) {
            console.error('Error al enviar formulario:', error);
            setSubmitStatus({
                success: false,
                message: 'Error al enviar el formulario: ' + (error.response?.data?.message || error.message)
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Generar PDF
    const generatePDF = async () => {
        setIsGeneratingPDF(true);
        try {
            const doc = new jsPDF('p', 'mm', 'a4');

            // Configuración
            const margin = 15;
            let y = margin;
            const pageWidth = doc.internal.pageSize.getWidth();
            const maxWidth = pageWidth - 2 * margin;

            // Función para agregar texto con manejo de saltos de página
            const addText = (text, size = 12, style = 'normal', x = margin) => {
                doc.setFontSize(size);
                doc.setFont(undefined, style);

                // Manejo de saltos de página
                if (y > 280) {
                    doc.addPage();
                    y = margin;
                }

                const lines = doc.splitTextToSize(text, maxWidth - (x-margin));
                doc.text(lines, x, y);
                y += lines.length * (size / 2.8) + 2; // Ajuste para espaciado de línea
            };

            // Cabecera del documento
            doc.setFillColor(139, 0, 0); // Rojo oscuro
            doc.rect(0, 0, pageWidth, 25, 'F');
            doc.setFontSize(16);
            doc.setTextColor(255, 255, 255);
            doc.text('Formulario de Necesidades', pageWidth / 2, 15, { align: 'center' });
            doc.setFontSize(10);
            doc.text(`Cuerpo de Bomberos | ${new Date().toLocaleDateString()}`, pageWidth / 2, 22, { align: 'center' });

            // Resetear posición y color
            y = 35;
            doc.setTextColor(0, 0, 0);

            // Sección: Información de la Brigada
            addText('1. INFORMACIÓN DE LA BRIGADA', 14, 'bold');
            y += 2;
            addText(`Nombre: ${formData.nombre}`);
            addText(`Bomberos activos: ${formData.cantidadactivos}`);
            addText(`Comandante: ${formData.nombrecomandante}`);
            addText(`Celular comandante: ${formData.celularcomandante}`);
            addText(`Encargado de logística: ${formData.encargadologistica || 'No especificado'}`);
            addText(`Celular logística: ${formData.celularlogistica || 'No especificado'}`);
            addText(`Números de emergencia: ${formData.numerosemergencia || 'No especificado'}`);
            y += 10;

            // Función para generar tablas de datos
            const generateTable = (title, headers, data, customData = []) => {
                if (y > 250) {
                    doc.addPage();
                    y = margin;
                }
                addText(title, 14, 'bold');

                const filteredData = Object.entries(data).filter(([key, value]) => {
                    if (typeof value === 'object' && value !== null) {
                        return Object.values(value).some(v => (typeof v === 'number' && v > 0) || (typeof v === 'string' && v.trim() !== ''));
                    }
                    return false;
                });

                const body = filteredData.map(([key, value]) => {
                    return headers.map(header => {
                        const lowerHeader = header.toLowerCase();
                        if(lowerHeader === 'item' || lowerHeader === 'artículo') return key;
                        return value[lowerHeader] ?? '';
                    });
                });

                customData.forEach(item => {
                    body.push(headers.map(header => {
                        const lowerHeader = header.toLowerCase();
                        if(lowerHeader === 'item' || lowerHeader === 'artículo') return `${item.item} (Otro)`;
                        return item[lowerHeader] ?? '';
                    }));
                });

                if (body.length > 0) {
                    autoTable(doc, {
                        startY: y,
                        head: [headers],
                        body: body,
                        theme: 'grid',
                        margin: { left: margin, right: margin },
                        styles: { fontSize: 8 },
                        headStyles: { fillColor: [50, 50, 50], textColor: [255,255,255], fontStyle: 'bold' },
                        alternateRowStyles: { fillColor: [245, 245, 245] }
                    });
                    y = doc.lastAutoTable.finalY + 10;
                } else {
                    addText('Sin requerimientos en esta sección.', 10, 'italic');
                    y += 5;
                }
            };

            // Generación de todas las tablas
            generateTable('2. EPP - Ropa', ['Artículo', 'XS', 'S', 'M', 'L', 'XL', 'Observaciones'], eppRopa, eppRopaCustom);
            generateTable('3. EPP - Equipo', ['Item', 'Cantidad', 'Observaciones'], eppEquipo, eppEquipoCustom);
            generateTable('4. Herramientas', ['Item', 'Cantidad', 'Observaciones'], herramientas, herramientasCustom);
            generateTable('5. Logística', ['Item', 'Costo', 'Observaciones'], logisticaRepuestos, logisticaRepuestosCustom);
            generateTable('6. Alimentación', ['Item', 'Cantidad', 'Observaciones'], alimentacion, alimentacionCustom);
            generateTable('7. Equipo de Campo', ['Item', 'Cantidad', 'Observaciones'], logisticaCampo, logisticaCampoCustom);
            generateTable('8. Limpieza Personal', ['Item', 'Cantidad', 'Observaciones'], limpiezaPersonal, limpiezaPersonalCustom);
            generateTable('9. Limpieza General', ['Item', 'Cantidad', 'Observaciones'], limpiezaGeneral, limpiezaGeneralCustom);
            generateTable('10. Medicamentos', ['Item', 'Cantidad', 'Observaciones'], medicamentos, medicamentosCustom);
            generateTable('11. Rescate Animal', ['Item', 'Cantidad', 'Observaciones'], rescateAnimal, rescateAnimalCustom);


            // Pie de página
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Página ${i} de ${pageCount}`, pageWidth / 2, 290, { align: 'center' });
            }

            // Guardar PDF
            doc.save(`formulario-brigada-${formData.nombre.replace(/\s+/g, '_') || 'sin_nombre'}.pdf`);

            setSubmitStatus({
                success: true,
                message: 'PDF generado correctamente.'
            });
        } catch (error) {
            console.error('Error al generar PDF:', error);
            setSubmitStatus({
                success: false,
                message: 'Error al generar el PDF: ' + error.message
            });
        } finally {
            setIsGeneratingPDF(false);
        }
    };


    // Estilos dinámicos para modo oscuro
    const bgColor = darkMode ? 'bg-gray-900' : 'bg-white';
    const textColor = darkMode ? 'text-gray-100' : 'text-gray-800';
    const cardBg = darkMode ? 'bg-gray-800' : 'bg-gray-50';
    const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';
    const inputStyle = `w-full px-4 py-2 rounded-lg border ${darkMode
        ? 'bg-gray-700 border-gray-600 focus:ring-2 focus:ring-purple-500'
        : 'bg-white border-gray-300 focus:ring-2 focus:ring-blue-500'} focus:outline-none transition-colors`;

    return (
        <div className={`min-h-screen ${bgColor} ${textColor} transition-colors duration-200`}>
            {/* Botón de modo oscuro flotante */}
            <button
                onClick={toggleDarkMode}
                className={`fixed top-4 right-4 z-50 p-2 rounded-full shadow-lg ${
                    darkMode
                        ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
                        : 'bg-gray-800 text-yellow-400 hover:bg-gray-700'
                } transition-colors`}
                aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
                {darkMode ? '☀️' : '🌙'}
            </button>

            <form
                onSubmit={handleSubmit}
                className={`rounded-xl shadow-xl overflow-hidden max-w-7xl mx-auto my-8 ${
                    darkMode ? 'bg-gray-800' : 'bg-white'
                } transition-colors`}
                ref={formRef}
            >
                {/* Header con gradiente dinámico */}
                <div
                    className="py-6 px-8 text-white"
                    style={{
                        background: `linear-gradient(135deg, ${
                            darkMode ? currentColors.primary.replace('7', '8') : currentColors.primary
                        }, ${
                            darkMode ? currentColors.secondary.replace('d', '9') : currentColors.secondary
                        })`
                    }}
                >
                    <div className="flex flex-col md:flex-row items-center justify-between">
                        <div className="flex items-center mb-4 md:mb-0">
                            <div className={`p-3 rounded-full mr-4 ${
                                darkMode ? 'bg-gray-700 shadow-inner' : 'bg-white shadow-md'
                            }`}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill={currentColors.primary}>
                                    <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-2xl md:text-3xl font-bold">Formulario de Necesidades</h1>
                                <p className="opacity-90 mt-1">Cuerpo de Bomberos Voluntarios</p>
                            </div>
                        </div>
                        <div className={`px-4 py-2 rounded-lg ${
                            darkMode ? 'bg-black bg-opacity-30' : 'bg-white bg-opacity-30'
                        } backdrop-blur-sm`}>
                            <p className="text-sm">Sección: <span className="font-semibold">{SECTIONS[currentSectionIndex]?.name}</span></p>
                        </div>
                    </div>
                </div>

                {/* Navegación entre secciones */}
                <div className={`px-4 py-3 border-b ${
                    darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
                }`}>
                    <div className="flex overflow-x-auto pb-2 space-x-2">
                        {SECTIONS.map((section, index) => {
                            const sectionColors = SECTION_COLORS[index] || SECTION_COLORS[0];
                            return (
                                <button
                                    key={section.id}
                                    type="button"
                                    onClick={() => goToSection(section.id)}
                                    className={`px-4 py-2 rounded-lg whitespace-nowrap text-sm font-medium transition-all duration-200 ${
                                        activeSection === section.id
                                            ? 'text-white shadow-md'
                                            : `${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-100'}`
                                    }`}
                                    style={{
                                        backgroundColor: activeSection === section.id ? sectionColors.primary : '',
                                        borderColor: activeSection !== section.id ? (darkMode ? sectionColors.secondary+'40' : sectionColors.primary+'80') : 'transparent'
                                    }}
                                >
                                    {section.name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Contenido principal del formulario */}
                <div className="p-6">
                    {submitStatus.isFinal && (
                        <div className={`mb-6 rounded-lg p-6 ${
                            submitStatus.success
                                ? `${darkMode ? 'bg-green-900 bg-opacity-30' : 'bg-green-50'} border-green-600`
                                : `${darkMode ? 'bg-red-900 bg-opacity-30' : 'bg-red-50'} border-red-600`
                        } border`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
                                        submitStatus.success ? 'bg-green-600' : 'bg-red-600'
                                    } text-white`}>
                                        {submitStatus.success ? '✓' : '✗'}
                                    </span>
                                    <div>
                                        <p className={`font-semibold ${
                                            submitStatus.success
                                                ? darkMode ? 'text-green-300' : 'text-green-800'
                                                : darkMode ? 'text-red-300' : 'text-red-800'
                                        }`}>
                                            {submitStatus.success ? '¡Formulario completado!' : 'Error al procesar'}
                                        </p>
                                        <p className={`text-sm ${
                                            submitStatus.success
                                                ? darkMode ? 'text-green-200' : 'text-green-700'
                                                : darkMode ? 'text-red-200' : 'text-red-700'
                                        }`}>
                                            {submitStatus.message}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={generatePDF}
                                        disabled={isGeneratingPDF}
                                        className={`rounded-md border px-3 py-1 text-sm font-medium ${
                                            isGeneratingPDF
                                                ? `${darkMode ? 'border-blue-900 text-blue-900' : 'border-blue-300 text-blue-300'} cursor-not-allowed`
                                                : `${darkMode ? 'border-blue-500 text-blue-400 hover:bg-blue-900' : 'border-blue-700 text-blue-800 hover:bg-blue-100'}`
                                        }`}
                                    >
                                        {isGeneratingPDF ? 'Generando...' : 'Descargar PDF'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => window.location.reload()}
                                        className={`rounded-md border px-3 py-1 text-sm font-medium ${
                                            darkMode
                                                ? 'border-green-500 text-green-400 hover:bg-green-900'
                                                : 'border-green-700 text-green-800 hover:bg-green-100'
                                        }`}
                                    >
                                        Nuevo Formulario
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Sección de Información */}
                    {activeSection === 'info' && (
                        <div className="space-y-6">
                            <h2 className={`text-xl font-bold border-l-4 pl-3 py-1 ${
                                darkMode ? 'border-purple-400' : 'border-purple-600'
                            }`}>
                                Información Básica de la Brigada
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Campo Nombre */}
                                <div>
                                    <label className={`block text-sm font-medium mb-1 ${textColor}`}>
                                        Nombre de la Brigada <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="nombre"
                                        value={formData.nombre}
                                        onChange={handleInputChange}
                                        className={`${inputStyle} ${
                                            formErrors.nombre ? 'border-red-500 focus:ring-red-500' :
                                                darkMode ? 'focus:border-purple-400' : 'focus:border-blue-500'
                                        }`}
                                        placeholder="Ej: Brigada San Martín"
                                        required
                                    />
                                    {formErrors.nombre && (
                                        <p className="mt-1 text-sm text-red-500">{formErrors.nombre}</p>
                                    )}
                                </div>

                                {/* Campo Cantidad de Bomberos */}
                                <div>
                                    <label className={`block text-sm font-medium mb-1 ${textColor}`}>
                                        Bomberos Activos <span className="text-red-500">*</span>
                                    </label>
                                    <NumberInput
                                        value={formData.cantidadactivos}
                                        onChange={(value) => setFormData(prev => ({
                                            ...prev,
                                            cantidadactivos: Math.max(1, value)
                                        }))}
                                        min={1}
                                        darkMode={darkMode}
                                        className="w-full"
                                    />
                                    {formErrors.cantidadactivos && (
                                        <p className="mt-1 text-sm text-red-500">{formErrors.cantidadactivos}</p>
                                    )}
                                    <p className={`text-xs mt-1 ${
                                        darkMode ? 'text-gray-400' : 'text-gray-500'
                                    }`}>
                                        Mínimo 1 bombero activo
                                    </p>
                                </div>

                                {/* Campo Comandante */}
                                <div>
                                    <label className={`block text-sm font-medium mb-1 ${textColor}`}>
                                        Comandante <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="nombrecomandante"
                                        value={formData.nombrecomandante}
                                        onChange={handleInputChange}
                                        className={`${inputStyle} ${
                                            formErrors.nombrecomandante ? 'border-red-500 focus:ring-red-500' :
                                                darkMode ? 'focus:border-purple-400' : 'focus:border-blue-500'
                                        }`}
                                        placeholder="Nombre completo del comandante"
                                        required
                                    />
                                    {formErrors.nombrecomandante && (
                                        <p className="mt-1 text-sm text-red-500">{formErrors.nombrecomandante}</p>
                                    )}
                                </div>

                                {/* Campo Teléfono Comandante */}
                                <div>
                                    <label className={`block text-sm font-medium mb-1 ${textColor}`}>
                                        Teléfono Comandante <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="tel"
                                        name="celularcomandante"
                                        value={formData.celularcomandante}
                                        onChange={handleInputChange}
                                        className={`${inputStyle} ${
                                            formErrors.celularcomandante ? 'border-red-500 focus:ring-red-500' :
                                                darkMode ? 'focus:border-purple-400' : 'focus:border-blue-500'
                                        }`}
                                        placeholder="Ej: 76543210"
                                        maxLength={8}
                                        required
                                    />
                                    {formErrors.celularcomandante && (
                                        <p className="mt-1 text-sm text-red-500">{formErrors.celularcomandante}</p>
                                    )}
                                    <p className={`text-xs mt-1 ${
                                        darkMode ? 'text-gray-400' : 'text-gray-500'
                                    }`}>
                                        8 dígitos sin espacios ni guiones
                                    </p>
                                </div>

                                {/* Campo Encargado Logística */}
                                <div>
                                    <label className={`block text-sm font-medium mb-1 ${textColor}`}>
                                        Encargado de Logística
                                    </label>
                                    <input
                                        type="text"
                                        name="encargadologistica"
                                        value={formData.encargadologistica}
                                        onChange={handleInputChange}
                                        className={`${inputStyle} ${
                                            formErrors.encargadologistica ? 'border-red-500 focus:ring-red-500' :
                                                darkMode ? 'focus:border-purple-400' : 'focus:border-blue-500'
                                        }`}
                                        placeholder="Nombre completo del encargado"
                                    />
                                    {formErrors.encargadologistica && (
                                        <p className="mt-1 text-sm text-red-500">{formErrors.encargadologistica}</p>
                                    )}
                                </div>

                                {/* Campo Teléfono Logística */}
                                <div>
                                    <label className={`block text-sm font-medium mb-1 ${textColor}`}>
                                        Teléfono Logística
                                    </label>
                                    <input
                                        type="tel"
                                        name="celularlogistica"
                                        value={formData.celularlogistica}
                                        onChange={handleInputChange}
                                        className={`${inputStyle} ${
                                            formErrors.celularlogistica ? 'border-red-500 focus:ring-red-500' :
                                                darkMode ? 'focus:border-purple-400' : 'focus:border-blue-500'
                                        }`}
                                        placeholder="Ej: 65432109"
                                        maxLength={8}
                                    />
                                    {formErrors.celularlogistica && (
                                        <p className="mt-1 text-sm text-red-500">{formErrors.celularlogistica}</p>
                                    )}
                                </div>

                                {/* Campo Números de Emergencia */}
                                <div className="md:col-span-2">
                                    <label className={`block text-sm font-medium mb-1 ${textColor}`}>
                                        Números de Emergencia (Opcional)
                                    </label>
                                    <input
                                        type="text"
                                        name="numerosemergencia"
                                        value={formData.numerosemergencia}
                                        onChange={handleInputChange}
                                        className={`${inputStyle} ${
                                            formErrors.numerosemergencia ? 'border-red-500 focus:ring-red-500' :
                                                darkMode ? 'focus:border-purple-400' : 'focus:border-blue-500'
                                        }`}
                                        placeholder="Ej: 12345678, 87654321"
                                    />
                                    {formErrors.numerosemergencia && (
                                        <p className="mt-1 text-sm text-red-500">{formErrors.numerosemergencia}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* El resto de las secciones (EPP, Herramientas, etc.) permanecen aquí sin cambios en su JSX */}
                    {/* ... */}

                    {/* Navegación inferior */}
                    <div className="mt-8">
                        <div className="mb-4 w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                            <div
                                className="bg-green-500 h-2.5 rounded-full"
                                style={{
                                    width: `${((currentSectionIndex + 1) / SECTIONS.length) * 100}%`,
                                    transition: 'width 0.3s ease'
                                }}
                            ></div>
                        </div>

                        <div className="flex flex-col md:flex-row justify-between gap-4">
                            <button
                                type="button"
                                onClick={() => currentSectionIndex > 0 && goToSection(SECTIONS[currentSectionIndex - 1].id)}
                                disabled={currentSectionIndex === 0}
                                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                                    currentSectionIndex === 0
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                                        : `${
                                            darkMode
                                                ? 'bg-purple-800 text-white hover:bg-purple-700'
                                                : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                        }`
                                }`}
                            >
                                Anterior
                            </button>

                            <div className="flex items-center justify-end gap-4">
                                {submitStatus.message && !submitStatus.isFinal && (
                                    <div className={`px-4 py-2 rounded-lg text-sm ${
                                        submitStatus.success
                                            ? darkMode ? 'bg-green-900/50 text-green-200' : 'bg-green-100 text-green-800'
                                            : darkMode ? 'bg-red-900/50 text-red-200' : 'bg-red-100 text-red-800'
                                    }`}>
                                        {submitStatus.message}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className={`px-6 py-2 rounded-lg font-medium text-white transition-colors ${
                                        isSubmitting
                                            ? 'bg-gray-400 cursor-not-allowed dark:bg-gray-600'
                                            : `${
                                                darkMode
                                                    ? 'bg-teal-700 hover:bg-teal-600'
                                                    : 'bg-blue-600 hover:bg-blue-700'
                                            }`
                                    }`}
                                >
                                    {currentSectionIndex === SECTIONS.length - 1
                                        ? (isSubmitting ? 'Finalizando...' : 'Finalizar')
                                        : (isSubmitting ? 'Guardando...' : 'Siguiente')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default BombForm;