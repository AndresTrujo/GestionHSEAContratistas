/**
 * Aviso de privacidad vigente (Revisión 01, última actualización: 8 de octubre de 2026).
 * Al cambiar el texto, sube `privacyNoticeVersion`: todas las personas vuelven a aceptarlo.
 * Cada aceptación guarda la versión y el sha256 del texto aceptado.
 */
export const privacyNoticeVersion = "2026-10-08-rev01";

export const privacyNoticeTitle = "Aviso de privacidad";

export interface PrivacyNoticeSection {
  heading: string;
  paragraphs: string[];
}

export const privacyNoticeSections: PrivacyNoticeSection[] = [
  {
    heading: "Aviso de privacidad",
    paragraphs: [
      'En cumplimiento de lo dispuesto por la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (la "Ley de Protección de Datos"), TFS Turbine Field Solutions, S.A. DE C.V., pone a su disposición el presente Aviso de Privacidad, respecto del tratamiento de sus datos personales:',
    ],
  },
  {
    heading: "1. Responsable del tratamiento de datos personales",
    paragraphs: [
      "TFS TURBINE FIELD SOLUTIONS, S.A. DE C.V., (en adelante TFS Turbine Field Solutions), con domicilio en Avenida Framboyanes, número 3303, Ciudad Industrial Bruno Pagliai, Veracruz, Veracruz de Ignacio de la Llave, Código Postal 91697, es responsable del tratamiento de sus datos personales y de su protección, en términos de lo dispuesto en la Ley de Protección de Datos.",
      "Para cualquier duda o consulta relacionada con el tratamiento de sus datos personales, podrá contactar al departamento Jurídico de TFS Turbine Field Solutions a través del correo electrónico aviso.privacidad@tfscorp.mx.",
    ],
  },
  {
    heading: "2. Finalidades del tratamiento de datos personales",
    paragraphs: [
      "TFS Turbine Field Solutions, en cumplimiento de lo dispuesto por la Ley de Protección de Datos, hace de su conocimiento que los datos personales que le sean proporcionados, serán tratados para las siguientes finalidades:",
      "I. Proporcionar los productos y/o servicios que haya solicitado o contratado, así como dar seguimiento a las solicitudes, cotizaciones y demás actividades relacionadas con la relación comercial.",
      "II. Analizar posibles negociaciones y, en su caso, celebrar contratos y demás actos jurídicos relacionados con la relación comercial.",
      "III. Evaluar la calidad de los productos y servicios que ofrece TFS Turbine Field Solutions.",
      "IV. Dar cumplimiento a los requerimientos realizados a TFS Turbine Field Solutions por autoridades competentes, así como a las obligaciones legales que resulten aplicables.",
      "V. Mantener actualizada la información y las bases de datos de TFS Turbine Field Solutions.",
      "VI. En el caso de colaboradores, integrar y mantener actualizados sus expedientes laborales, así como contar con la información de los contactos de emergencia que proporcionen, a fin de establecer comunicación en caso de emergencia.",
      "VII. Cumplir y hacer cumplir las obligaciones derivadas de las relaciones contractuales y comerciales que TFS Turbine Field Solutions mantenga con el Grupo Empresarial Nuvoil.",
      "VIII. Informar acerca de los productos y/o servicios ofrecidos por TFS Turbine Field Solutions, así como sobre promociones, novedades y demás información comercial.",
      "IX. Las demás finalidades que resulten aplicables y sean informadas al titular de conformidad con la Ley de Protección de Datos.",
    ],
  },
  {
    heading: "3. Datos personales que podrán recabarse",
    paragraphs: [
      "Para las finalidades mencionadas, TFS Turbine Field Solutions podrá recabar sus datos personales de distintas maneras, ya sea que sean proporcionados directamente por usted, de forma personal, vía telefónica o electrónica, o bien, a través de otras fuentes permitidas por la legislación aplicable en materia de protección de datos personales. Los datos personales que TFS Turbine Field Solutions podrá solicitar a efecto de llevar a cabo las finalidades anteriormente mencionadas, son los siguientes: nombre, nacionalidad, domicilio, estado civil, Registro Federal de Contribuyentes (en su caso), dirección de correo electrónico, número telefónico fijo, número celular, edad, nombres de familiares, teléfonos fijos y móviles de estos últimos, lugar de nacimiento, sexo, C.U.R.P., número de Cédula Profesional, ocupación, formación académica, y experiencia laboral.",
      "Tratándose de visitantes a las instalaciones de TFS Turbine Field Solutions, se recabarán únicamente el nombre, el tipo y número de la identificación presentada, la empresa u organización de procedencia, el motivo de la visita y la hora de entrada y salida, con la finalidad de controlar el acceso y mantener la seguridad de las instalaciones. La identificación se presenta únicamente para su verificación y no será retenida por TFS Turbine Field Solutions.",
      "TFS Turbine Field Solutions no recaba de manera ordinaria datos personales sensibles. No obstante, en caso de que resulte necesario recabar este tipo de datos, se obtendrá el consentimiento expreso y por escrito del titular para su tratamiento, a través de su firma autógrafa, firma electrónica, o cualquier mecanismo de autenticación, de conformidad con lo dispuesto por la Ley de Protección de Datos. Asimismo, TFS Turbine Field Solutions se compromete a: (i) tratar dichos datos bajo las medidas de seguridad, responsabilidad y confidencialidad aplicables; y, (ii) utilizarlos únicamente para las finalidades que justifiquen su tratamiento y de conformidad con lo dispuesto por la Ley de Protección de Datos.",
    ],
  },
  {
    heading: "4. Medidas de seguridad",
    paragraphs: [
      "TFS Turbine Field Solutions, como responsable del tratamiento de sus datos personales, implementa medidas de seguridad administrativas, técnicas y físicas para proteger los datos personales que se encuentren bajo su responsabilidad y prevenir su daño, pérdida, alteración, destrucción o acceso, uso, o tratamiento no autorizado, de conformidad con las disposiciones legales aplicables y las políticas internas de la empresa.",
    ],
  },
  {
    heading: "5. Ejercicio de los derechos de acceso, rectificación, cancelación y oposición (derechos ARCO)",
    paragraphs: [
      "Usted podrá ejercer en cualquier momento sus derechos de acceso, rectificación, cancelación y oposición (derechos ARCO), así como revocar el consentimiento que, en su caso, nos haya otorgado para el tratamiento de sus datos personales, salvo en los casos de excepción previstos en la legislación aplicable.",
      "Para conocer el procedimiento, requisitos y plazos para el ejercicio de sus derechos ARCO y/o la revocación de su consentimiento, podrá presentar su solicitud a través del correo electrónico aviso.privacidad@tfscorp.mx, indicando el derecho que desea ejercer y proporcionando la información necesaria para la atención. La solicitud será atendida de conformidad con los plazos y términos establecidos en la Ley de Protección de Datos y demás disposiciones aplicables. La determinación correspondiente será comunicada al titular a través del correo electrónico proporcionado para tal efecto.",
    ],
  },
  {
    heading: "6. Limitación del uso o divulgación de sus datos personales",
    paragraphs: [
      "Usted podrá solicitar en cualquier momento la limitación del uso o divulgación de sus datos personales, mediante una solicitud enviada al correo electrónico aviso.privacidad@tfscorp.mx., indicando la limitación que desea realizar. TFS Turbine Field Solutions dará trámite a su solicitud, y en su caso, aplicará la limitación correspondiente, informándole sobre la misma por el mismo medio.",
    ],
  },
  {
    heading: "7. Transferencia de datos",
    paragraphs: [
      "Sus datos personales podrán ser transferidos y tratados dentro y fuera del país, por TFS Turbine Field Solutions, así como por las empresas que integran el Grupo Empresarial Nuvoil. Asimismo, sus datos personales podrán ser transferidos a autoridades competentes cuando sean requeridos en ejercicio de sus atribuciones, así como en los demás supuestos permitidos o previstos por la legislación aplicable.",
      "Los terceros que, en su caso reciban sus datos personales, estarán obligados a tratarlos de conformidad con las disposiciones aplicables en materia de protección de datos personales y únicamente para las finalidades que correspondan.",
      "Cuando sea necesario obtener su consentimiento para realizar alguna transferencia de sus datos personales, TFS Turbine Field Solutions lo solicitará en los términos establecidos por la legislación aplicable.",
    ],
  },
  {
    heading: "8. Uso de cookies",
    paragraphs: [
      'Esta página web utiliza "cookies", que son archivos de texto que se almacenan en su dispositivo cuando visita nuestro sitio web y que permiten obtener información relacionada con su navegación, así como facilitar y mejorar su experiencia de usuario. Usted puede aceptar, rechazar, bloquear o eliminar las cookies mediante la configuración de su navegador web. Sin embargo, tenga en cuenta que la desactivación de determinadas cookies puede afectar el funcionamiento o la disponibilidad de algunas funcionalidades de nuestro sitio web.',
    ],
  },
  {
    heading: "9. Consentimiento",
    paragraphs: [
      "Cuando el tratamiento de sus datos personales requiera de su consentimiento, TFS Turbine Field Solutions lo solicitará en los términos establecidos por la legislación aplicable. En los casos en que la legislación permita obtener el consentimiento de manera tácita, este se entenderá otorgado cuando el titular no manifieste su negativa al tratamiento de sus datos personales mediante el correo electrónico aviso.privacidad@tfscorp.mx.",
    ],
  },
  {
    heading: "10. Modificaciones al aviso de privacidad",
    paragraphs: [
      "TFS Turbine Field Solutions podrá modificar o actualizar el presente Aviso de Privacidad, con el propósito de adecuarlo, mejorarlo y/o actualizarlo de acuerdo con nuevas disposiciones legislativas, políticas internas o nuevos requerimientos de la empresa. Cualquier modificación será comunicada mediante su publicación en el sitio web www.tfscorp.com.mx.",
      "TFS TURBINE FIELD SOLUTIONS, S.A. DE C.V.",
      "Fecha de última actualización: 08 de octubre de 2026",
    ],
  },
];
